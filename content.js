// Improved button selection algorithm
function chooseBestButtonElement(elements) {
    // Filter out irrelevant buttons (e.g., region buttons, help buttons)
    const filteredElements = elements.filter(el => {
        const text = el.innerText.toLowerCase();
        const id = (el.id || '').toLowerCase();
        const testId = (el.getAttribute('data-testid') || '').toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const classNames = Array.from(el.classList).join(' ').toLowerCase();

        // Exclude buttons that are not relevant
        const isExcluded =
            (text.includes('region') || id.includes('region') || testId.includes('region') || ariaLabel.includes('region')) ||
            (text.includes('cancel') && !text.includes('cancel and') && !text.includes('dont cancel')) ||
            (text.includes('help') && !text.includes('helper')) ||
            (classNames.includes('nav') && !classNames.includes('navigation-action'));

        return !isExcluded;
    });

    // Use filtered list if available, otherwise fall back to original
    const elementsToScore = filteredElements.length > 0 ? filteredElements : elements;

    // Enhanced scoring system
    const scoredElements = elementsToScore.map(el => {
        let score = 0;
        const text = el.innerText.trim();
        const rect = el.getBoundingClientRect();
        const inViewport = rect.top >= 0 && rect.top <= window.innerHeight;

        // Strong indicators of primary action buttons
        if (el.classList.contains('awsui-button-variant-primary')) score += 15;
        if (el.getAttribute('data-testid')?.includes('create-button')) score += 15;
        if (el.getAttribute('data-testid')?.includes('primary')) score += 12;
        if (el.classList.contains('btn-primary')) score += 10;

        // Text-based indicators
        if (text.match(/create|add|save|apply|launch|next|continue|confirm|submit|update/i)) score += 8;

        // Visibility and position factors
        if (inViewport) score += 10;
        if (!el.disabled && el.getAttribute('aria-disabled') !== 'true') score += 5;

        // Positioned in the main content area (centered)
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const distanceFromCenter = Math.sqrt(
            Math.pow((rect.left + rect.width / 2) - centerX, 2) +
            Math.pow((rect.top + rect.height / 2) - centerY, 2)
        );
        score += Math.max(0, 5 - (distanceFromCenter / 100));

        // Penalize very small buttons (likely icons/utilities)
        if (rect.width < 30 || rect.height < 20) score -= 5;

        // Penalize buttons at page edges (likely navigation)
        if (rect.left < 50 || rect.right > window.innerWidth - 50) score -= 3;

        return { element: el, score };
    });

    // Sort by score and return the highest-scoring element
    scoredElements.sort((a, b) => b.score - a.score);
    return scoredElements[0]?.element || elements[0];
}

// Function to highlight an element with a red outline
function highlightElement(element, elementType) {
    // Remove any existing highlights
    removeHighlights();

    // Add a red outline
    element.style.outline = "2px solid red"; // Red outline
    element.style.outlineOffset = "2px";
    element.style.transition = "outline 0.2s ease";

    // Scroll the element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Add a click event listener to remove the highlight when the element is clicked
    element.addEventListener("click", removeHighlights, { once: true });
}

// Function to remove all highlights
function removeHighlights() {
    const highlightedElements = document.querySelectorAll("[style*='outline: 2px solid red']");
    highlightedElements.forEach(el => {
        el.style.outline = "";
        el.style.outlineOffset = "";
    });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "highlightStep") {
        const stepText = request.step;
        highlightStep(stepText);
        sendResponse({ success: true });
    }
});