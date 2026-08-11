// /plugins/Cabal/cabal/static/cabal/js/nexus/_batch_processor.js

class InvenTreeBatchProcessor {
    constructor(options = {}) {
        this.delayMs = options.delayMs || 1200; 
        this.isProcessing = false;
        this.shouldStop = false;
        
        const dryRunToggle = document.getElementById("dryRunToggle");
        this.dryRun = dryRunToggle !== null ? dryRunToggle.checked : (options.dryRun ?? true);
        
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

        const dryRunToggle = document.getElementById("dryRunToggle");
        if (dryRunToggle !== null) {
            this.dryRun = dryRunToggle.checked;
        }

        const loop_length = rows.length;
        const modeLabel = this.dryRun ? "🧪 [DRY RUN MODE]" : "⚡ [LIVE WRITE MODE]";

        this.logToUI(`Starting batch run for ${loop_length} rows in ${modeLabel}...`);

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
                if (this.dryRun) { this.logToUI(`🔍 [DEBUG] Sending Metron lookup query -> Barcode: "${upc}", Title: "${title}"`); }

                const lookupResult = await this.performLookup(upc, title);

                // If there was a failure
                if (!lookupResult || !lookupResult.success) {
                    const failReason = lookupResult?.error || lookupResult?.message || "Lookup failed: No matching comic found on Metron.";
                    this.logToUI(`❌ [DEBUG] Metron lookup returned failure: ${JSON.stringify(lookupResult, null, 2)}`);
                    this.recordFailure(rowId, row, failReason);
                    await this.sleep(this.delayMs);
                    continue;
                }

                if (this.dryRun) { this.logToUI(`✅ [DEBUG] Metron lookup successful. Raw comic data:\n${JSON.stringify(lookupResult.comic_data, null, 2)}`); }

                const payload = this.buildInvenTreePayload(row, lookupResult);
                if (this.dryRun) { this.logToUI(`📦 [DEBUG] Constructed InvenTree payload:\n${JSON.stringify(payload, null, 2)}`); }

                const result = await this.createInvenTreePartAndStock(payload);

                if (result && result.success) {
                    if (this.dryRun) { this.logToUI(`🎉 [DEBUG] InvenTree write successful response:\n${JSON.stringify(result, null, 2)}`); }

                    this.recordSuccess(rowId, title, upc, payload, result.data?.part?.pk);
                } else {
                    if (this.dryRun) { this.logToUI(`❌ [DEBUG] InvenTree write failed response:\n${JSON.stringify(result, null, 2)}`); }

                    this.recordFailure(rowId, row, `InvenTree API Error: ${result?.message || 'Failed to create part'}`);
                }

            } catch (err) {
                if (this.dryRun) { this.logToUI(`💥 [DEBUG] Unexpected Exception caught at Row ${rowId}:\nStack: ${err.stack || err.message}`); }

                this.recordFailure(rowId, row, `Unexpected Script Error: ${err.message}`);
            }

            await this.sleep(this.delayMs);
        }

        this.isProcessing = false;
        this.printSummary();
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
                const errorText = await response.text();
                return { success: false, error: `HTTP Error ${response.status} (${response.statusText}): ${errorText}` };
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
                discounted_price: parseFloat(row.discounted_price || row["Discounted Price"] || 0.00),
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
        if (this.dryRun) {
            await this.sleep(150);
            const simulatedParameters = [
                { template_name: 16, name: "Condition", value: payload.metadata.condition || "Near Mint" },
                { template_name: 68, name: "Store Date", value: payload.metadata.store_date || "" },
                { template_name: 64, name: "Barcode / UPC", value: payload.part.barcode || payload.metadata.upc },
                { template_name: 11, name: "Listed on Whatnot", value: payload.pricing.listed_on_whatnot ?? true },
                { template_name: 69, name: "Item Cost", value: payload.pricing.discounted_price || "" },
            ].filter(p => p.value !== "" && p.value !== null);

            if (this.dryRun) {
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would create part with name: "${payload.part.name}", IPN: "${payload.part.IPN}"`);
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would download and attach image from: "${payload.part.image_url || 'None'}"`);
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would set sale price: $${payload.pricing.retail_price} (Qty: ${payload.stock.quantity})`);
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would set item cost: ${payload.pricing.discounted_price}`);
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would assign stock location ID: ${payload.stock.location}`);
                this.logToUI(`🧪 [DRY RUN SIMULATION] Would write ${simulatedParameters.length} part parameters:\n${JSON.stringify(simulatedParameters, null, 2)}`);
            }

            return {
                success: true,
                data: {
                    part: { pk: 99999, name: payload.part.name },
                    parameters_added: simulatedParameters.length,
                    dry_run: true
                }
            };
        }

        try {
            const partRequestBody = {
                active: true,
                category: payload.part.category,
                description: payload.part.description,
                image: null,
                IPN: payload.part.IPN,
                name: payload.part.name,
                salable: true,
                virtual: false,
            };

            if (this.dryRun) { this.logToUI(`📡 [DEBUG] POSTing to /api/part/ with body:\n${JSON.stringify(partRequestBody, null, 2)}`); }

            const partResponse = await fetch('/api/part/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify(partRequestBody)
            });

            if (!partResponse.ok) {
                const errData = await partResponse.json();
                return { 
                    success: false, 
                    message: `Part Creation Failed (Status ${partResponse.status}): ${JSON.stringify(errData)}` 
                };
            }

            const createdPart = await partResponse.json();
            const partId = createdPart.pk || createdPart.id;
            this.logToUI(`✅ [DEBUG] Successfully created Part PK #${partId}`);

            if (payload.part.image_url) {
                try {
                    if (this.dryRun) { this.logToUI(`📡 [DEBUG] Requesting server-side image attach for URL: ${payload.part.image_url}`); }
                    
                    const imageProxyRes = await fetch(`/plugin/cabal/attach-image/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': this.getCsrfToken()
                        },
                        body: JSON.stringify({
                            part_id: partId,
                            image_url: payload.part.image_url
                        })
                    });

                    if (imageProxyRes.ok) {
                        if (this.dryRun) { this.logToUI(`✅ [DEBUG] Successfully attached image via server-side handler for Part PK #${partId}`); }
                    } else {
                        const proxyErr = await imageProxyRes.text();
                        if (this.dryRun) { this.logToUI(`⚠️ [DEBUG] Server-side image attach warning (Status ${imageProxyRes.status}): ${proxyErr}`); }
                    }
                } catch (imgErr) {
                    this.logToUI(`⚠️ [DEBUG] Exception occurred during server-side image attach: ${imgErr.message}`);
                }
            }

            if (payload.pricing?.retail_price) {
                const priceBody = {
                    part: partId,
                    quantity: payload.stock.quantity,
                    price: payload.pricing.retail_price,
                    price_currency: 'USD'
                };
                if (this.dryRun) { this.logToUI(`📡 [DEBUG] POSTing to /api/part/sale-price/ with body:\n${JSON.stringify(priceBody, null, 2)}`); }
                
                const priceRes = await fetch('/api/part/sale-price/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(priceBody)
                });
                
                if (!priceRes.ok) {
                    const priceErr = await priceRes.text();
                    this.logToUI(`⚠️ [DEBUG] Warning: Sale price API returned status ${priceRes.status}: ${priceErr}`);
                }
            }

            const parametersToCreate = [
                { template_name: 16, name: "Condition", value: payload.metadata.condition || "Near Mint" },
                { template_name: 68, name: "Store Date", value: payload.metadata.store_date || "" },
                { template_name: 64, name: "Barcode / UPC", value: payload.part.barcode || payload.metadata.upc },
                { template_name: 11, name: "Listed on Whatnot", value: payload.pricing.listed_on_whatnot ?? true },
                { template_name: 69, name: "Item Cost", value: payload.pricing.discounted_price || "" },
            ];

            const validParameters = parametersToCreate.filter(param => param.value !== "" && param.value !== null);
            if (this.dryRun) { this.logToUI(`📡 [DEBUG] Writing ${validParameters.length} Part Parameters for Part PK #${partId}:\n${JSON.stringify(validParameters, null, 2)}`); }

            const parameterPromises = validParameters.map(param => {
                const paramBody = {
                    model_type: 'part.part',
                    model_id: partId,
                    template: param.template_name, 
                    data: String(param.value)
                };

                return fetch('/api/parameter/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(paramBody)
                }).then(async res => {
                    if (!res.ok) {
                        const errText = await res.text();

                        this.logToUI(`⚠️ [DEBUG] Parameter template ${param.template_name} (${param.name}) write failed: ${errText}`);
                    }

                    return res;
                });
            });

            await Promise.all(parameterPromises);

            const location_id = payload.stock.location;
            if (location_id) {
                const stockBody = {
                    part: partId,
                    quantity: payload.stock.quantity,
                    location: location_id,
                    notes: `Ingested via Nexus batch. Condition: ${payload.metadata.condition || "NM"}`
                };

                if (this.dryRun) { this.logToUI(`📡 [DEBUG] POSTing to /api/stock/ with body:\n${JSON.stringify(stockBody, null, 2)}`); }
                
                const stockRes = await fetch('/api/stock/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(stockBody)
                });

                if (!stockRes.ok) {
                    const stockErr = await stockRes.text();

                    if (this.dryRun) { this.logToUI(`⚠️ [DEBUG] Stock creation warning (Status ${stockRes.status}): ${stockErr}`); }
                } else {
                    if (this.dryRun) { this.logToUI(`✅ [DEBUG] Successfully allocated stock quantity ${payload.stock.quantity} to location ID ${location_id}`); }
                }
            } else {
                this.logToUI(`ℹ️ [DEBUG] No stock location mapped for publisher code "${payload.metadata.publisher_code}". Skipping automatic stock item creation.`);
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

        const prefix = this.dryRun ? "🧪 [DRY RUN SUCCESS]" : "✅ [LIVE CREATED]";
        this.logToUI(`${prefix} Part: "${payload.part.name}" | IPN: ${payload.part.IPN} | Barcode: ${payload.part.barcode}`);
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
        summary += `🏁 BATCH PROCESS COMPLETE (${this.dryRun ? "DRY RUN" : "LIVE"})\n`;
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

    exportBatchReportToExcel() {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
        const modePrefix = this.dryRun ? "DryRun" : "Live";
        const fileName = `Batch_Ingestion_${modePrefix}_Report_${timestamp}.xlsx`;

        const insertedData = this.successfulEntries.map(e => ({
            "Batch Row ID": e.rowId,
            "InvenTree Part PK": e.createdPartId || "",
            "Part Name": e.payload.part.name,
            "IPN": e.payload.part.IPN,
            "UPC / Barcode": e.payload.part.barcode,
            "Retail Price": e.payload.pricing.retail_price,
            "Discounted Price": e.payload.pricing.discounted_price,
            "Quantity": e.payload.stock.quantity,
            "Publisher": e.payload.metadata.publisher,
            "Series": e.payload.metadata.series,
            "Issue": e.payload.metadata.issue,
            "Variant": e.payload.metadata.variant,
            "Store Date": e.payload.metadata.store_date,
            "Metron ID": e.payload.metadata.metron_id || ""
        }));

        const erroredData = this.failedEntries.map(e => ({
            "Batch Row ID": e.rowId,
            ...(e.row || {}),
            "Failure Reason": e.reason
        }));

        if (typeof XLSX !== "undefined") {
            const wb = XLSX.utils.book_new();

            const wsInserted = XLSX.utils.json_to_sheet(
                insertedData.length > 0 ? insertedData : [{"Status": "No items successfully processed"}]
            );
            const wsErrored = XLSX.utils.json_to_sheet(
                erroredData.length > 0 ? erroredData : [{"Status": "No errored items"}]
            );

            XLSX.utils.book_append_sheet(wb, wsInserted, this.dryRun ? "Simulated Inserted" : "Inserted");
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
