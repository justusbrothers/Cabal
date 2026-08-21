// /plugins/Cabal/cabal/static/cabal/js/nexus/_inventree_helpers.js

document.addEventListener('DOMContentLoaded', function() {
    async function performLookup(upc, title, onSuccess = null, onError = null) {
        console.group(`🔍 [Nexus Lookup] Starting lookup request`);
        console.log(`📌 UPC / Barcode:`, upc);
        console.log(`📌 Title:`, title);

        let result;

        try {
            const response = await fetch('/plugin/cabal/spectacle/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    barcode: upc,
                    title: title
                })
            });

            console.log(`🌐 [Nexus Lookup] Response status: ${response.status} ${response.statusText}`);

            if (response.status === 429) {
                result = { success: false, error: "HTTP 429: Metron Rate Limit Exceeded. Slow down requests." };
                console.warn(`⚠️ [Nexus Lookup] Rate limit exceeded (429).`);
            } else if (!response.ok) {
                const errorText = await response.text();
                result = { success: false, error: `HTTP Error ${response.status} (${response.statusText}): ${errorText}` };
                console.error(`❌ [Nexus Lookup] Server error response:`, errorText);
            } else {
                result = await response.json();
                console.log(`✅ [Nexus Lookup] Successfully parsed response JSON:`, result);
            }
        } catch (e) {
            result = { success: false, error: `Network Failure: ${e.message}` };
            console.error(`💥 [Nexus Lookup] Network or fetch exception caught:`, e);
        }

        // Trigger callbacks if provided
        if (result.success) {
            console.log(`🎉 [Nexus Lookup] Lookup successful. Triggering onSuccess callback...`);
            if (typeof onSuccess === "function") {
                onSuccess(result);
            }
        } else {
            console.warn(`⚠️ [Nexus Lookup] Lookup failed. Triggering onError callback with error:`, result.error);
            if (typeof onError === "function") {
                onError(result);
            }
        }

        console.groupEnd();

        return result;
    }

    function buildInvenTreePayload(row, spectacleData) {
        console.group(`📦 [Nexus Payload Builder] Constructing payload for row:`, row);
        console.log(`📚 Spectacle Data provided:`, spectacleData);

        const comic = spectacleData?.comic_data || {};

        const payload = {
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
            },
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
            pricing: {
                retail_price: parseFloat(row.retail || comic.price || 0.00),
                discounted_price: parseFloat(row.discounted_price || row["Discounted Price"] || 0.00),
                listed_on_whatnot: comic.listed_on_whatnot || true
            },
            stock: {
                quantity: parseInt(row.qty || 1, 10),
                location: typeof PUBLISHER_STOCK_LOCATIONS !== 'undefined' ? PUBLISHER_STOCK_LOCATIONS[comic.pub_code] : null
            }
        };

        console.log(`✨ [Nexus Payload Builder] Final constructed payload:`, payload);
        console.groupEnd();
        return payload;
    }

    async function createInvenTreePartAndStock(payload, isDryRun, logger) {
        console.group(`🚀 [InvenTree Ingest] Starting part/stock creation (Dry Run: ${isDryRun})`);
        console.log(`📋 Ingest Payload:`, payload);

        if (isDryRun) {
            await sleep(150);

            const simulatedParameters = [
                { template_name: 16, name: "Condition", value: payload.metadata.condition || "Near Mint" },
                { template_name: 68, name: "Store Date", value: payload.metadata.store_date || "" },
                { template_name: 64, name: "Barcode / UPC", value: payload.part.barcode || payload.metadata.upc },
                { template_name: 11, name: "Listed on Whatnot", value: payload.pricing.listed_on_whatnot ?? true },
                { template_name: 69, name: "Item Cost", value: payload.pricing.discounted_price || "" },
            ].filter(p => p.value !== "" && p.value !== null);

            if (logger) {
                logger(`🧪 [DRY RUN SIMULATION] Would create part with name: "${payload.part.name}", IPN: "${payload.part.IPN}"`);
                logger(`🧪 [DRY RUN SIMULATION] Would download and attach image from: "${payload.part.image_url || 'None'}"`);
                logger(`🧪 [DRY RUN SIMULATION] Would set sale price: $${payload.pricing.retail_price} (Qty: ${payload.stock.quantity})`);
                logger(`🧪 [DRY RUN SIMULATION] Would set item cost: $${payload.pricing.discounted_price}`);
                logger(`🧪 [DRY RUN SIMULATION] Would assign stock location ID: ${payload.stock.location}`);
                logger(`🧪 [DRY RUN SIMULATION] Would write ${simulatedParameters.length} part parameters:\n${JSON.stringify(simulatedParameters, null, 2)}`);
            }

            console.log(`🧪 [Dry Run] Simulation completed successfully.`);
            console.groupEnd();
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
            console.log(`📡 [API Call] POST /api/part/`);

            const partResponse = await fetch('/api/part/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    active: true,
                    category: payload.part.category,
                    description: payload.part.description,
                    image: null,
                    IPN: payload.part.IPN,
                    name: payload.part.name,
                    salable: true,
                    virtual: false,
                })
            });

            if (!partResponse.ok) {
                const errData = await partResponse.json();
                console.error(`❌ [API Error] Part creation failed with status ${partResponse.status}:`, errData);
                console.groupEnd();
                return { 
                    success: false, 
                    message: `Part Creation Failed (Status ${partResponse.status}): ${JSON.stringify(errData)}` 
                };
            }

            const createdPart = await partResponse.json();
            const partId = createdPart.pk || createdPart.id;

            console.log(`✅ [API Success] Part created with PK/ID: ${partId}`, createdPart);

            if (payload.part.image_url) {
                try {
                    console.log(`🖼️ [API Call] Attaching image from URL: ${payload.part.image_url}`);
                    await fetch(`/plugin/cabal/attach-image/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCsrfToken()
                        },
                        body: JSON.stringify({
                            part_id: partId,
                            image_url: payload.part.image_url
                        })
                    });
                    console.log(`🖼️ [API Success] Image attachment request sent.`);
                } catch (imgErr) {
                    console.warn(`⚠️ [Image Attachment Warning] Failed to attach image:`, imgErr);
                }
            }

            if (payload.pricing?.retail_price) {
                console.log(`💰 [API Call] Setting sale price: $${payload.pricing.retail_price} for qty ${payload.stock.quantity}`);
                await fetch('/api/part/sale-price/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify({
                        part: partId,
                        quantity: payload.stock.quantity,
                        price: payload.pricing.retail_price,
                        price_currency: 'USD'
                    })
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
            console.log(`📊 [Parameters] Submitting ${validParameters.length} parameters for part ${partId}:`, validParameters);

            const parameterPromises = validParameters.map(param => {
                return fetch('/api/parameter/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify({
                        model_type: 'part.part',
                        model_id: partId,
                        template: param.template_name, 
                        data: String(param.value)
                    })
                });
            });

            await Promise.all(parameterPromises);
            console.log(`✅ [Parameters] All parameters successfully saved.`);

            const location_id = payload.stock.location;
            if (location_id) {
                console.log(`📦 [API Call] Adding stock location ID ${location_id}, quantity ${payload.stock.quantity}`);
                await fetch('/api/stock/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify({
                        part: partId,
                        quantity: payload.stock.quantity,
                        location: location_id,
                        notes: `Ingested via Nexus batch. Condition: ${payload.metadata.condition || "NM"}`
                    })
                });
                console.log(`✅ [Stock] Stock entry created.`);
            } else {
                console.warn(`⚠️ [Stock Warning] No stock location assigned for pub code: ${payload.metadata.publisher_code}`);
            }

            console.log(`🎉 [InvenTree Ingest] Part creation flow completed successfully!`);
            console.groupEnd();

            return {
                success: true,
                data: {
                    part: createdPart,
                    parameters_added: validParameters.length
                }
            };

        } catch (error) {
            console.error(`💥 [InvenTree Ingest Error] Unhandled exception during part creation/stock ingestion:`, error);
            console.groupEnd();

            return {
                success: false,
                message: `Network or Server Error: ${error.message}`
            };
        }
    }

    window.NexusInventreeHelpers = {
        performLookup,
        buildInvenTreePayload,
        createInvenTreePartAndStock
    };
});
