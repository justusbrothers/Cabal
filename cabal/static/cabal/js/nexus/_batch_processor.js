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

        const progressContainer = document.getElementById("batchProgressContainer");
        const progressBar = document.getElementById("batchProgressBar");

        // Always show the progress bar now
        if (progressContainer) {
            progressContainer.style.display = "block";
            if (progressBar) {
                progressBar.style.width = "0%";
                progressBar.textContent = "0%";
            }
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

                if (!lookupResult || !lookupResult.success) {
                    const failReason = lookupResult?.error || lookupResult?.message || "Lookup failed: No matching comic found on Metron.";
                    if (this.dryRun) { this.logToUI(`❌ [DEBUG] Metron lookup returned failure: ${JSON.stringify(lookupResult, null, 2)}`); }
                    this.recordFailure(rowId, row, failReason);
                    await this.sleep(this.delayMs);
                    this.updateProgress(index + 1, loop_length, progressBar);
                    continue;
                }

                if (this.dryRun) { this.logToUI(`✅ [DEBUG] Metron lookup successful. Raw comic data:\n${JSON.stringify(lookupResult.comic_data, null, 2)}`); }

                const resolvedComic = lookupResult.comic_data || {};
                const resolvedTitle = String(resolvedComic.title || title || "").trim();

                if (resolvedTitle.length > 100) {
                    this.logToUI(`⚠️ [WARNING] Resolved title length (${resolvedTitle.length} chars) exceeds 100 character limit. Pausing batch for user review.`);
                    
                    const updatedTitle = await this.promptForLongTitle(rowId, resolvedTitle);
                    
                    if (updatedTitle === null) {
                        this.logToUI(`⚠️ [WARNING] User skipped or cancelled title prompt for row ${rowId}. Aborting batch.`);
                        this.shouldStop = true;
                        break;
                    }

                    resolvedComic.title = updatedTitle;
                    if (this.dryRun) { this.logToUI(`✏️ [DEBUG] Continuing batch with updated title: "${updatedTitle}"`); }
                }

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
            this.updateProgress(index + 1, loop_length, progressBar);
        }

        this.isProcessing = false;
        this.printSummary();
        this.exportBatchReportToExcel();
        await this.finalizeProgress(progressBar, progressContainer);
    }

    promptForLongTitle(rowId, currentTitle) {
        return new Promise((resolve) => {
            const existingOverlay = document.getElementById("nexusTitlePromptOverlay");
            if (existingOverlay) existingOverlay.remove();

            const overlay = document.createElement("div");
            overlay.id = "nexusTitlePromptOverlay";
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.6); z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                font-family: inherit;
            `;

            const dialog = document.createElement("div");
            dialog.style.cssText = `
                background: #1e1e1e; color: #f1f1f1; padding: 24px; border-radius: 8px;
                width: 500px; max-width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                border: 1px solid #333;
            `;

            dialog.innerHTML = `
                <h3 style="margin-top: 0; color: #ffc107;">⚠️ Long Title Detected (Row ${rowId})</h3>
                <p style="font-size: 14px; color: #bbb; margin-bottom: 12px;">
                    The resolved comic issue title is <strong>${currentTitle.length} characters</strong> long (exceeds the 100-character limit). Please review and edit the title below before continuing:
                </p>
                <div style="margin-bottom: 16px;">
                    <input type="text" id="nexusLongTitleInput" value="${currentTitle.replace(/"/g, '&quot;')}" placeholder="${currentTitle.replace(/"/g, '&quot;')}" style="
                        width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #444;
                        color: #fff; border-radius: 4px; font-size: 14px; box-sizing: border-box;
                    ">
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="nexusCancelBatchBtn" type="button" style="
                        padding: 8px 16px; background: #444; color: #fff; border: none;
                        border-radius: 4px; cursor: pointer; font-weight: bold;
                    ">Stop Batch</button>
                    <button id="nexusSubmitTitleBtn" type="button" style="
                        padding: 8px 16px; background: #007bff; color: #fff; border: none;
                        border-radius: 4px; cursor: pointer; font-weight: bold;
                    ">Confirm & Continue</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const inputField = document.getElementById("nexusLongTitleInput");
            inputField.focus();
            inputField.select();

            const cleanup = (resultValue) => {
                overlay.remove();
                resolve(resultValue);
            };

            document.getElementById("nexusSubmitTitleBtn").addEventListener("click", () => {
                cleanup(inputField.value.trim());
            });

            document.getElementById("nexusCancelBatchBtn").addEventListener("click", () => {
                cleanup(null);
            });

            inputField.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    cleanup(inputField.value.trim());
                } else if (e.key === "Escape") {
                    cleanup(null);
                }
            });
        });
    }

    updateProgress(current, total, progressBar) {
        if (progressBar) {
            const percentage = Math.round((current / total) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${percentage}% (${current}/${total})`;
            
            // Ensure standard styling while progressing
            progressBar.classList.remove('bg-success');
            progressBar.classList.add('bg-primary');
        }
    }

    async finalizeProgress(progressBar, progressContainer) {
        if (progressBar) {
            progressBar.style.width = "100%";
            progressBar.textContent = "100% (Complete)";
            progressBar.classList.remove('bg-primary');
            progressBar.classList.add('bg-success'); // Solid green
        }

        // Wait for 10 seconds before resetting and hiding
        await this.sleep(10000);

        if (progressBar) {
            progressBar.style.width = "0%";
            progressBar.textContent = "0%";
            progressBar.classList.remove('bg-success');
            progressBar.classList.add('bg-primary');
        }

        if (progressContainer) {
            progressContainer.style.display = "none";
        }
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

            if (payload.part.image_url) {
                try {
                    await fetch(`/plugin/cabal/attach-image/`, {
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
                } catch (imgErr) {
                    // Suppress network-level image attachment warnings on live runs
                }
            }

            if (payload.pricing?.retail_price) {
                const priceBody = {
                    part: partId,
                    quantity: payload.stock.quantity,
                    price: payload.pricing.retail_price,
                    price_currency: 'USD'
                };
                
                await fetch('/api/part/sale-price/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(priceBody)
                });
            }

            const parametersToCreate = [
                { template_name: 16, name: "Condition", value: payload.metadata.condition || "Near Mint" },
                { template_name: 68, name: "Store Date", value: payload.metadata.store_date || "" },
                { template_name: 64, name: "Barcode / UPC", value: payload.part.barcode || payload.metadata.upc },
                { template_name: 11, name: "Listed on Whatnot", value: payload.pricing.listed_on_whatnot ?? true },
                { template_name: 69, name: "Item Cost", value: payload.pricing.discounted_price || "" },
            ];

            const validParameters = parametersToCreate.filter(param => param.value !== "" && param.value !== null);

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
                
                await fetch('/api/stock/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(stockBody)
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
        // Always stream to the dev console
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
