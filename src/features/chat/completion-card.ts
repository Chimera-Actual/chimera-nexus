/**
 * @file Renders agent completion notification cards.
 *
 * When a background agent finishes, a completion card is inserted into the
 * chat panel summarising the outcome and linking to any output file.
 */

/** Maximum number of characters shown in the card body before truncation. */
const SUMMARY_TRUNCATE_LENGTH = 200;

/**
 * Renders an inline completion notification inside the chat panel.
 */
export class CompletionCard {
  /**
   * Inserts a completion card into `container` and returns the card element.
   *
   * The card contains:
   * - A header showing `@{agentName} completed`
   * - A body with the summary (truncated to 200 chars if necessary)
   * - Action buttons: View, Summary (expand), and Dismiss
   *
   * @param container - The element that will receive the card.
   * @param agentName - Display name of the agent that completed.
   * @param summary - Brief text summarising what the agent did.
   * @param outputPath - Optional vault-relative path to the agent's output note.
   * @param onView - Optional callback invoked when the "View" button is clicked.
   * @param onDismiss - Optional callback invoked when the card is dismissed.
   * @returns The created card element.
   */
  show(
    container: HTMLElement,
    agentName: string,
    summary: string,
    outputPath?: string,
    onView?: () => void,
    onDismiss?: () => void
  ): HTMLElement {
    const card = container.createDiv({ cls: "chimera-completion-card" });

    // Header
    const header = card.createDiv({ cls: "chimera-completion-card-header" });
    header.textContent = `@${agentName} completed`;

    // Body
    const isTruncated = summary.length > SUMMARY_TRUNCATE_LENGTH;
    const truncatedText = isTruncated
      ? summary.slice(0, SUMMARY_TRUNCATE_LENGTH) + "..."
      : summary;

    const body = card.createDiv({ cls: "chimera-completion-card-body" });
    body.textContent = truncatedText;

    // Actions footer
    const actions = card.createDiv({ cls: "chimera-completion-card-actions" });

    // View button
    const viewBtn = actions.createEl("button");
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => {
      if (onView) {
        onView();
      } else if (outputPath) {
        // Fall back to logging the path; consumers can override via onView.
        console.log(`[CompletionCard] outputPath: ${outputPath}`);
      }
    });

    // Summary expand button (only useful when text is truncated)
    if (isTruncated) {
      const summaryBtn = actions.createEl("button");
      summaryBtn.textContent = "Summary";
      let expanded = false;
      summaryBtn.addEventListener("click", () => {
        expanded = !expanded;
        body.textContent = expanded ? summary : truncatedText;
        summaryBtn.textContent = expanded ? "Collapse" : "Summary";
      });
    }

    // Dismiss button
    const dismissBtn = actions.createEl("button");
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => {
      this.dismiss(card);
      if (onDismiss) {
        onDismiss();
      }
    });

    return card;
  }

  /**
   * Removes a completion card from its parent with a brief fade-out effect.
   *
   * @param card - The card element to remove.
   */
  dismiss(card: HTMLElement): void {
    card.style.transition = "opacity 0.2s ease";
    card.style.opacity = "0";
    setTimeout(() => {
      card.parentElement?.removeChild(card);
    }, 200);
  }
}
