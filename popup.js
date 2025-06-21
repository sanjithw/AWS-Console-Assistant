// Create connection to keep extension alive
let keepAlivePort = chrome.runtime.connect({ name: "keepAlive" });
let reconnectInterval;

// Function to maintain connection
function setupKeepAlive() {
    if (reconnectInterval) clearInterval(reconnectInterval);
    reconnectInterval = setInterval(() => {
        if (keepAlivePort) keepAlivePort.disconnect();
        keepAlivePort = chrome.runtime.connect({ name: "keepAlive" });
    }, 25000);
}

// Function to format steps returned by the API
function formatSteps(stepsText) {
    let steps = stepsText.split(/\n\s*\d+\.\s+/).filter(Boolean);
    if (steps.length <= 1) steps = stepsText.split(/\n\n+/).filter(Boolean);

    let html = `<div style="font-weight: bold; margin-bottom: 15px; color: #232f3e;">
        ✅ Step-by-Step AWS Guide:
    </div>`;

    if (steps.length > 0) {
        html += '<div style="counter-reset: step-counter;">';
        steps.forEach((step, index) => {
            html += `
            <div class="step-container" id="step-${index}" style="margin-bottom: 12px; padding-left: 28px; position: relative;">
                <div style="position: absolute; left: 0; top: 0; background: #ff9900; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">
                    ${index + 1}
                </div>
                <div>${step.trim()}</div>
                <div class="step-status" style="font-size: 12px; margin-top: 3px; color: #666;"></div>
            </div>`;
        });
        html += '</div>';

        html += `
        <div style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button id="prev-step" style="background: #eee; color: #333; width: auto; padding: 5px 10px;" disabled>Previous</button>
            <span id="step-counter" style="align-self: center; font-size: 12px;">Step 1 of ${steps.length}</span>
            <button id="next-step" style="background: #ff9900; color: white; width: auto; padding: 5px 10px;">Next</button>
        </div>`;
    } else {
        html += `<p>${stepsText}</p>`;
    }

    return html;
}

// Function to fetch AWS guide data from the API
function fetchAwsGuideData() {
    const apiKey = document.getElementById("apiKey").value.trim();
    const userPrompt = document.getElementById("userPrompt").value.trim();
    const outputElement = document.getElementById("output");
    const loadingSpinner = document.getElementById("loadingSpinner");

    if (!apiKey || !userPrompt) {
        outputElement.innerHTML = "❌ Please enter both API Key and AWS task description.";
        return;
    }

    chrome.storage.local.set({ geminiApiKey: apiKey });

    outputElement.innerHTML = "";
    loadingSpinner.style.display = "block";  // Show spinner

    // Capture screenshot of the current page
    chrome.tabs.captureVisibleTab(null, { format: "png" }, function (screenshotUrl) {
        if (!screenshotUrl) {
            console.error("Failed to capture screenshot");
            loadingSpinner.style.display = "none";
            outputElement.innerHTML = "❌ Failed to capture screenshot. Please try again.";
            return;
        }

        // Convert screenshot to base64
        const screenshotBase64 = screenshotUrl.split(",")[1];

        // Get current page context
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.runtime.sendMessage({
                    action: "fetchAWSData",
                    apiKey,
                    prompt: userPrompt,
                    screenshot: screenshotBase64  // Include the screenshot
                }, (response) => {
                    loadingSpinner.style.display = "none"; // Hide spinner after response

                    if (response && response.success) {
                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            if (tabs[0]) {
                                chrome.storage.local.set({ lastUrl: tabs[0].url });
                            }
                        });

                        let formattedSteps = formatSteps(response.steps);
                        outputElement.innerHTML = formattedSteps;

                        startGuidedWalkthrough(response.steps);
                        document.getElementById("resetGuide").style.display = "block";

                        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                            if (tabs[0]) {
                                chrome.tabs.sendMessage(tabs[0].id, { action: "startWalkthrough" }, function (response) {
                                    if (chrome.runtime.lastError) {
                                        console.error("Could not establish connection:", chrome.runtime.lastError);
                                    } else {
                                        console.log("Walkthrough started successfully");
                                    }
                                });
                            }
                        });
                    } else {
                        outputElement.innerHTML = `
                            <div style="color: #721c24; background-color: #f8d7da; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                                <strong>Error:</strong> ${response?.error || "Unknown error. Please check your API key and try again."}
                            </div>
                        `;
                    }
                });
            }
        });
    });
}

// Function to start the guided walkthrough
function startGuidedWalkthrough(stepsText) {
    let steps = stepsText.split(/\n\s*\d+\.\s+/).filter(Boolean);
    if (steps.length <= 1) steps = stepsText.split(/\n\n+/).filter(Boolean);

    let startIndex = 0;
    if (steps.length > 1 && !stepsText.trim().startsWith("1.")) startIndex = 1;

    if (window.currentStepIndex === undefined) window.currentStepIndex = startIndex;
    window.totalSteps = steps.length - startIndex;

    updateStepHighlight(window.currentStepIndex);

    const prevButton = document.getElementById('prev-step');
    const nextButton = document.getElementById('next-step');

    if (prevButton && nextButton) {
        prevButton.replaceWith(prevButton.cloneNode(true));
        nextButton.replaceWith(nextButton.cloneNode(true));

        const newPrevButton = document.getElementById('prev-step');
        const newNextButton = document.getElementById('next-step');

        newPrevButton.addEventListener('click', () => {
            if (window.currentStepIndex > startIndex) {
                window.currentStepIndex--;
                updateStepUI();
                updateStepHighlight(window.currentStepIndex);
                chrome.storage.local.set({ currentStepIndex: window.currentStepIndex });
            }
        });

        newNextButton.addEventListener('click', () => {
            if (window.currentStepIndex < steps.length - 1) {
                window.currentStepIndex++;
                updateStepUI();
                updateStepHighlight(window.currentStepIndex);
                chrome.storage.local.set({ currentStepIndex: window.currentStepIndex });
            }
        });

        updateStepUI();
    }

    function updateStepUI() {
        const stepCounter = document.getElementById('step-counter');
        const prevButton = document.getElementById('prev-step');
        const nextButton = document.getElementById('next-step');

        if (stepCounter) stepCounter.textContent = `Step ${window.currentStepIndex - startIndex + 1} of ${window.totalSteps}`;
        if (prevButton) prevButton.disabled = (window.currentStepIndex <= startIndex);
        if (nextButton) nextButton.disabled = (window.currentStepIndex >= steps.length - 1);

        document.querySelectorAll('.step-container').forEach((container, idx) => {
            if (idx + startIndex === window.currentStepIndex) {
                container.style.backgroundColor = 'rgba(255, 153, 0, 0.1)';
                container.style.borderLeft = '3px solid #ff9900';
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                container.style.backgroundColor = '';
                container.style.borderLeft = '';
            }
        });
    }
}

// Function to highlight the current step in the UI
function updateStepHighlight(stepIndex) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && tabs[0].url.includes("amazon.com")) {
            const stepContainers = document.querySelectorAll('.step-container');
            const stepStatusElements = document.querySelectorAll('.step-status');

            if (!stepContainers[stepIndex]) return;

            const stepText = stepContainers[stepIndex].textContent.toLowerCase();

            if (stepStatusElements[stepIndex]) {
                stepStatusElements[stepIndex].textContent = "Looking for elements...";
                stepStatusElements[stepIndex].style.color = "#856404";
            }

            let elementType = "button";
            let selectorOptions = [];

            if (stepText.includes("click") || stepText.includes("select") || stepText.includes("choose") || stepText.includes("press")) {
                elementType = "button";

                const buttonTextMatch = stepText.match(/click (?:on|the)?\s*["']([^"']+)["']/i) ||
                    stepText.match(/click (?:on|the)?\s*(\w+(?:\s+\w+){0,3})\s+button/i);

                if (buttonTextMatch && buttonTextMatch[1]) {
                    const buttonText = buttonTextMatch[1].trim();
                    selectorOptions = [
                        `button:contains("${buttonText}")`,
                        `[role="button"]:contains("${buttonText}")`,
                        `a:contains("${buttonText}")`,
                        `[data-testid*="${buttonText.toLowerCase().replace(/\s+/g, '-')}"]`,
                        `[data-testid*="${buttonText.toLowerCase().replace(/\s+/g, '_')}"]`,
                        `[aria-label*="${buttonText}"]`
                    ];
                }

                selectorOptions = selectorOptions.map(selector =>
                    `${selector}:not([data-testid*="region"]):not([id*="region"]):not([aria-label*="region"])`
                );
            } else if (stepText.includes("enter") || stepText.includes("type") || stepText.includes("fill") || stepText.includes("input")) {
                elementType = "input";

                const fieldNameMatch = stepText.match(/(?:enter|type|in|into)(?:\s+the)?\s*["']?([^"']+?)["']?\s*(?:field|box|input|area)/i);

                if (fieldNameMatch && fieldNameMatch[1]) {
                    const fieldName = fieldNameMatch[1].trim();
                    selectorOptions = [
                        `input[name*="${fieldName.toLowerCase()}"]`,
                        `input[id*="${fieldName.toLowerCase()}"]`,
                        `input[aria-label*="${fieldName}"]`,
                        `textarea[name*="${fieldName.toLowerCase()}"]`,
                        `[data-testid*="${fieldName.toLowerCase().replace(/\s+/g, '-')}"]`
                    ];
                }
            }

            if (elementType === "button") {
                selectorOptions = [
                    ...selectorOptions,
                    'button.awsui-button-variant-primary:not([data-testid*="region"]):not([id*="region"])',
                    '.awsui-button-variant-primary:not([data-testid*="region"]):not([id*="region"])',
                    '[data-testid*="button"]:not([data-testid*="region"]):not([id*="region"])',
                    '.awsui-button:not([data-testid*="region"]):not([id*="region"])',
                    '.btn-primary:not([data-testid*="region"]):not([id*="region"])',
                    '.btn-action:not([data-testid*="region"]):not([id*="region"])',
                    'button:not([disabled]):not([data-testid*="region"]):not([id*="region"])',
                    '[role="button"]:not([disabled]):not([data-testid*="region"]):not([id*="region"])'
                ];
            } else if (elementType === "input") {
                selectorOptions = [
                    ...selectorOptions,
                    'input[type="text"]:not([disabled]):not([readonly])',
                    'input[type="search"]:not([disabled]):not([readonly])',
                    'textarea:not([disabled]):not([readonly])',
                    '[contenteditable="true"]',
                    '.awsui-input:not([disabled]):not([readonly])'
                ];
            }

            trySelectorOptions(tabs[0].id, selectorOptions, elementType, 0, stepIndex, stepStatusElements);
        }
    });
}

// Function to try each selector option one by one
function trySelectorOptions(tabId, selectors, elementType, index, stepIndex, statusElements) {
    if (index >= selectors.length) {
        if (statusElements[stepIndex]) {
            statusElements[stepIndex].textContent = "Could not find matching elements. Please proceed manually.";
            statusElements[stepIndex].style.color = "#721c24";
        }
        return;
    }

    const selector = selectors[index];
    console.log(`Trying selector: ${selector}`);

    chrome.tabs.sendMessage(tabId, {
        action: elementType === "button" ? "highlightAWSButton" : "highlightInputField",
        selector: selector
    }, response => {
        if (chrome.runtime.lastError) {
            trySelectorOptions(tabId, selectors, elementType, index + 1, stepIndex, statusElements);
            return;
        }

        if (response && response.success) {
            if (statusElements[stepIndex]) {
                statusElements[stepIndex].textContent = `Found and highlighted a ${elementType}.`;
                statusElements[stepIndex].style.color = "#155724";
            }
        } else {
            trySelectorOptions(tabId, selectors, elementType, index + 1, stepIndex, statusElements);
        }
    });
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', function () {
    setupKeepAlive();

    chrome.storage.local.get(['geminiApiKey', 'currentSteps', 'currentStepIndex', 'lastUrl'], function (result) {
        if (result.geminiApiKey) document.getElementById("apiKey").value = result.geminiApiKey;

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const statusElement = document.getElementById("connectionStatus");
            const currentUrl = tabs[0]?.url || "";

            if (tabs[0] && tabs[0].url.includes("aws.amazon.com")) {
                statusElement.textContent = "✓ Connected to AWS Console";
                statusElement.classList.add("status-ok");

                if (result.currentSteps && result.lastUrl === currentUrl) {
                    const outputElement = document.getElementById("output");
                    let formattedSteps = formatSteps(result.currentSteps);
                    outputElement.innerHTML = formattedSteps;

                    window.currentStepIndex = result.currentStepIndex || 0;
                    startGuidedWalkthrough(result.currentSteps);
                    updateStepHighlight(window.currentStepIndex);

                    document.getElementById("resetGuide").style.display = "block";

                    const resumeNotification = document.createElement("div");
                    resumeNotification.className = "status-badge badge-success";
                    resumeNotification.textContent = "✓ Resumed from previous session";
                    resumeNotification.style.display = "block";
                    resumeNotification.style.marginBottom = "10px";
                    outputElement.parentNode.insertBefore(resumeNotification, outputElement);

                    setTimeout(() => {
                        resumeNotification.style.opacity = "0";
                        resumeNotification.style.transition = "opacity 0.5s";
                        setTimeout(() => resumeNotification.remove(), 500);
                    }, 3000);
                }
            } else {
                statusElement.textContent = "⚠ Not connected to AWS Console";
                statusElement.classList.add("status-error");
            }
        });
    });

    document.getElementById("resetGuide").addEventListener("click", function () {
        chrome.storage.local.remove(['currentSteps', 'currentStepIndex', 'lastUrl']);

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "endWalkthrough" }, function (response) {
                    if (chrome.runtime.lastError) {
                        console.error("Could not establish connection:", chrome.runtime.lastError);
                    } else {
                        console.log("Walkthrough ended successfully");
                    }
                });
            }
        });

        document.getElementById("output").innerHTML = "";
        this.style.display = "none";

        const resetNotification = document.createElement("div");
        resetNotification.className = "status-badge badge-success";
        resetNotification.textContent = "✓ Guide reset successfully";
        resetNotification.style.display = "block";
        resetNotification.style.marginBottom = "10px";
        document.getElementById("outputContainer").prepend(resetNotification);

        setTimeout(() => {
            resetNotification.style.opacity = "0";
            resetNotification.style.transition = "opacity 0.5s";
            setTimeout(() => resetNotification.remove(), 500);
        }, 3000);
    });

    document.getElementById("fetchAWSData").addEventListener("click", fetchAwsGuideData);
});