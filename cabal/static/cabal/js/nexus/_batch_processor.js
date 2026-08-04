// /plugins/Cabal/cabal/static/cabal/js/nexus/_batch_processor.js

/**
 * Metron / Spectacle Automated Batch Processor with Excel Export
 */
class InvenTreeBatchProcessor {
    constructor(options = {}) {
        this.delayMs = options.delayMs || 1200; 
        this.isProcessing = false;
        this.shouldStop = false;
        
        this.successfulEntries = [];
        this.failedEntries = [];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async startBatch(rows) {
        this.isProcessing = true;
        this.shouldStop = false;
        this.successfulEntries = [];
        this.failedEntries = [];

        const loop_length = rows.length;

        this.logToUI(`Starting batch run for ${loop_length} rows...`);

        for (let index = 0; index < loop_length; index++) { 
            if (this.shouldStop) {
                this.logToUI("\n⚠️ Batch processing stopped by user.");
                break;
            }

            const row = rows[index];
            const upc = String(row.upc || row[1] || "").trim();
            const title = String(row.title || row[0] || "").trim();
            const rowId = index + 1;

            this.logToUI(`\n--------------------------------------------------`);
            this.logToUI(`[${rowId}/${rows.length}] Processing: "${title}" (UPC: ${upc || 'N/A'})`);

            try {
                // Step 1: Perform Metron / Spectacle Lookup
                const lookupResult = await this.performLookup(upc, title);

                if (!lookupResult || !lookupResult.success) {
                    const failReason = lookupResult?.error || lookupResult?.message || "Lookup failed: No matching comic found on Metron.";
                    this.recordFailure(rowId, row, failReason);
                    await this.sleep(this.delayMs);
                    continue;
                }

                // Step 2: Build Comprehensive Payload
                const payload = this.buildInvenTreePayload(row, lookupResult);

                const result = await this.createInvenTreePartAndStock(payload);

                if (result && result.success) {
                    this.recordSuccess(rowId, title, upc, payload, result.data?.part?.pk);
                } else {
                    this.recordFailure(rowId, row, `InvenTree API Error: ${result?.message || 'Failed to create part'}`);
                }

            } catch (err) {
                this.recordFailure(rowId, row, `Unexpected Script Error: ${err.message}`);
            }

            // Respect Metron rate limit
            await this.sleep(this.delayMs);
        }

        this.isProcessing = false;

        this.printSummary();

        // Automatically trigger Excel Report Generation
        this.exportBatchReportToExcel();
    }

    stop() {
        this.shouldStop = true;
    }

    async performLookup(upc, title) {
        try {
            const response = await fetch('/plugin/cabal/spectacle/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ barcode: upc, title: title })
            });

            if (response.status === 429) {
                return { success: false, error: "HTTP 429: Metron Rate Limit Exceeded. Slow down requests." };
            }

            if (!response.ok) {
                return { success: false, error: `HTTP Error ${response.status}: ${response.statusText}` };
            }

            return await response.json();
        } catch (e) {
            return { success: false, error: `Network Failure: ${e.message}` };
        }
    }

    buildInvenTreePayload(row, spectacleData) {
        const comic = spectacleData?.comic_data || {};

        return {
            part: {
                name: comic.title || row.title || "Unknown Title",
                description: comic.description || (comic.issue ? `Issue #${comic.issue}` : ""),
                IPN: row.ipn || comic.ipn_proposed || comic.pub_code || "COMIC-GENERIC",
                barcode: row.upc || spectacleData?.scanned_barcode || comic.scanned_barcode || "",
                category: comic.category || null,
                keywords: `${comic.series || ''} ${comic.publisher || ''} ${comic.variant || ''}`.trim(),
                link: comic.metron_url || comic.part_link || "",
                image_url: comic.image_url || ""
            },
            
            stock: {
                quantity: parseInt(row.qty || 1, 10),
                location: typeof PUBLISHER_STOCK_LOCATIONS !== 'undefined' ? PUBLISHER_STOCK_LOCATIONS[comic.pub_code] : null
            },

            pricing: {
                retail_price: parseFloat(row.retail || comic.price || 0.00),
                listed_on_whatnot: comic.listed_on_whatnot || true
            },

            metadata: {
                publisher: comic.publisher || "Unknown Publisher",
                publisher_code: comic.pub_code || "",
                series: comic.series || "",
                volume: comic.volume || "1",
                issue: comic.issue || "",
                variant: comic.variant || "Standard",
                metron_id: comic.metron_id || null,
                store_date: comic.store_date || "",
                matched_via: spectacleData?.message || "Direct API Match"
            }
        };
    }

    async createInvenTreePartAndStock(payload) {
        try {
            // Step 1: Create the Part in InvenTree
            const partResponse = await fetch('/api/part/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({
                    active: true,
                    category: payload.part.category,
                    description: payload.part.description,
                    image: null,
                    IPN: payload.part.IPN,
                    name: payload.part.name,
                    salable: true,
                    remote_image: payload.part.image_url || null,
                    virtual: false,
                })
            });

            if (!partResponse.ok) {
                const errData = await partResponse.json();
                return { 
                    success: false, 
                    message: `Part Creation Failed: ${JSON.stringify(errData)}` 
                };
            }

            const createdPart = await partResponse.json();
            const partId = createdPart.pk || createdPart.id;

            // Step 2: Set Pricing via Sale Price Break
            if (payload.pricing?.retail_price) {
                await fetch('/api/part/sale-price/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify({
                        part: partId,
                        quantity: payload.stock.quantity,
                        price: payload.pricing.retail_price,
                        price_currency: 'USD'
                    })
                });
            }

            // Step 3: Define Part Parameters
            const parametersToCreate = [
                { template_name: 16, value: payload.metadata.condition || "Near Mint" },
                { template_name: 68, value: payload.metadata.store_date || "" },
                { template_name: 64, value: payload.part.barcode || payload.metadata.upc },
                { template_name: 11, value: payload.pricing.listed_on_whatnot || true },
            ];

            const validParameters = parametersToCreate.filter(param => param.value !== "" && param.value !== null);

            // Step 4: Attach Parameters
            const parameterPromises = validParameters.map(param => 
                fetch('/api/parameter/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify({
                        model_type: 'part.part',
                        model_id: partId,
                        template: param.template_name, 
                        data: String(param.value)
                    })
                })
            );

            await Promise.all(parameterPromises);

            const location_id = payload.stock.location;
            if (location_id) {
                await fetch('/api/stock/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify({
                        part: partId,
                        quantity: payload.stock.quantity,
                        location: location_id,
                        notes: `Ingested via Nexus batch. Condition: ${payload.metadata.condition || "NM"}`
                    })
                });
            }

            return {
                success: true,
                data: {
                    part: createdPart,
                    parameters_added: validParameters.length
                }
            };

        } catch (error) {
            return {
                success: false,
                message: `Network or Server Error: ${error.message}`
            };
        }
    }

    recordSuccess(rowId, title, upc, payload, createdPartId = null) {
        const entry = { rowId, title, upc, payload, createdPartId };
        this.successfulEntries.push(entry);

        this.logToUI(`✅ [LIVE CREATED] Part: "${payload.part.name}" | IPN: ${payload.part.IPN} | Barcode: ${payload.part.barcode}`);
    }

    recordFailure(rowId, row, reason) {
        const title = String(row?.title || row?.[0] || "").trim();
        const upc = String(row?.upc || row?.[1] || "").trim();

        const entry = { rowId, row, title, upc, reason };
        this.failedEntries.push(entry);

        this.logToUI(`❌ [FAILED] Row ${rowId} ("${title}") -> Reason: ${reason}`);
    }

    logToUI(message) {
        console.log(message);

        const logTextArea = document.getElementById("sessionIpnLog");
        if (logTextArea) {
            logTextArea.value += message + "\n";
            logTextArea.scrollTop = logTextArea.scrollHeight;
        }
    }

    printSummary() {
        let summary = `\n========================================\n`;
        summary += `🏁 BATCH PROCESS COMPLETE\n`;
        summary += ` Total Processed: ${this.successfulEntries.length + this.failedEntries.length}\n`;
        summary += ` Successful: ${this.successfulEntries.length}\n`;
        summary += ` Failed: ${this.failedEntries.length}\n`;
        summary += `========================================\n`;

        if (this.failedEntries.length > 0) {
            summary += `\nFAILED ITEMS BREAKDOWN:\n`;
            this.failedEntries.forEach(f => {
                summary += `• Row ${f.rowId} [UPC: ${f.upc || 'N/A'}] "${f.title}": ${f.reason}\n`;
            });
        }

        this.logToUI(summary);
    }

    /**
     * Generates and downloads the multi-sheet Excel file ("Inserted" & "Errored")
     */
    exportBatchReportToExcel() {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
        const fileName = `Batch_Ingestion_Report_${timestamp}.xlsx`;

        // Format "Inserted" Sheet Data
        const insertedData = this.successfulEntries.map(e => ({
            "Batch Row ID": e.rowId,
            "InvenTree Part PK": e.createdPartId || "",
            "Part Name": e.payload.part.name,
            "IPN": e.payload.part.IPN,
            "UPC / Barcode": e.payload.part.barcode,
            "Retail Price": e.payload.pricing.retail_price,
            "Quantity": e.payload.stock.quantity,
            "Publisher": e.payload.metadata.publisher,
            "Series": e.payload.metadata.series,
            "Issue": e.payload.metadata.issue,
            "Variant": e.payload.metadata.variant,
            "Store Date": e.payload.metadata.store_date,
            "Metron ID": e.payload.metadata.metron_id || ""
        }));

        // Format "Errored" Sheet Data: Preserves the entire original CSV row & appends Failure Reason
        const erroredData = this.failedEntries.map(e => ({
            "Batch Row ID": e.rowId,
            ...(e.row || {}),
            "Failure Reason": e.reason
        }));

        // Use SheetJS (XLSX) if available
        if (typeof XLSX !== "undefined") {
            const wb = XLSX.utils.book_new();

            const wsInserted = XLSX.utils.json_to_sheet(
                insertedData.length > 0 ? insertedData : [{"Status": "No items successfully inserted"}]
            );
            const wsErrored = XLSX.utils.json_to_sheet(
                erroredData.length > 0 ? erroredData : [{"Status": "No errored items"}]
            );

            XLSX.utils.book_append_sheet(wb, wsInserted, "Inserted");
            XLSX.utils.book_append_sheet(wb, wsErrored, "Errored");

            XLSX.writeFile(wb, fileName);
            this.logToUI(`\n📊 Excel Report exported successfully: ${fileName}`);
        } else {
            this.logToUI("\n⚠️ SheetJS (XLSX) library not found on page. Generating fallback CSV download...");
            this.downloadFallbackCsv(insertedData, `Batch_Inserted_${timestamp}.csv`);
            this.downloadFallbackCsv(erroredData, `Batch_Errored_${timestamp}.csv`);
        }
    }

    downloadFallbackCsv(dataArray, filename) {
        if (!dataArray || dataArray.length === 0) return;

        const headers = Object.keys(dataArray[0]).join(",");
        const rows = dataArray.map(obj => 
            Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")
        );

        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
    }
}
