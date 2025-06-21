chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchAWSData") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const currentUrl = tabs[0]?.url || "";
            const awsService = extractAWSServiceFromUrl(currentUrl);

            const structuredPrompt = `
You are an AWS Console assistant. Provide step-by-step instructions for the following AWS task.
Current user location: ${currentUrl}
Current AWS service: ${awsService || "Unknown"}

FORMAT REQUIREMENTS:
1. Begin with a brief 1-sentence overview of the task
2. Provide numbered steps (1., 2., etc.) with clear, concise instructions
3. Each step must be actionable and specific
4. Include only UI interactions (clicks, inputs, selections)
5. Mention specific AWS Console element names exactly as they appear
6. DO NOT include code snippets or CLI commands

USER TASK: ${request.prompt}
`;

            fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + request.apiKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: structuredPrompt },
                            { inlineData: { mimeType: "image/png", data: request.screenshot } }
                        ]
                    }],
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.2,
                        topP: 0.8
                    }
                })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => {
                            console.error("API Error:", err);
                            throw new Error(`HTTP Error ${response.status}: ${err.error?.message || "Unknown error"}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.candidates && data.candidates.length > 0) {
                        let steps = data.candidates[0].content.parts[0].text;
                        steps = steps.replace(/```.*?```/gs, "").trim();

                        steps = steps.split('\n').map((line, index) => {
                            return `${index + 1}. ` + line.replace(/^\d+\.\s*/, "");
                        }).join('\n');

                        chrome.storage.local.set({
                            currentSteps: steps,
                            currentStepIndex: 0,
                            lastUrl: currentUrl
                        });

                        sendResponse({ success: true, steps });
                    } else {
                        sendResponse({ success: false, error: "No response from Gemini." });
                    }
                })
                .catch(error => {
                    console.error("Fetch Error:", error);
                    sendResponse({ success: false, error: error.message });
                });
        });

        return true;
    }
});

function extractAWSServiceFromUrl(url) {
    if (!url || !url.includes("aws.amazon.com")) return null;
    const serviceMatch = url.match(/console\.aws\.amazon\.com\/([^/?#]+)/);
    if (serviceMatch && serviceMatch[1]) return serviceMatch[1].toUpperCase();
    if (url.includes("console.aws.amazon.com/console/home")) return "AWS Console Home";
    return null;
}

chrome.runtime.onConnect.addListener(function (port) {
    if (port.name === "keepAlive") {
        port.onDisconnect.addListener(function () {
            setTimeout(() => chrome.runtime.connect({ name: "keepAlive" }), 100);
        });
    }
});