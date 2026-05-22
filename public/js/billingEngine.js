const runEngineBtn = document.getElementById("runEngineBtn");

if (runEngineBtn) {
  runEngineBtn.addEventListener("click", async () => {
    const notesElement = document.getElementById("engineNotes");
    const btn = document.getElementById("runEngineBtn");
    const loadingIndicator = document.getElementById("engineLoading");
    const resultsContainer = document.getElementById("engineResults");
    const sequenceList = document.getElementById("sequenceList");
    const reasoningText = document.getElementById("engineReasoning");

    btn.disabled = true;
    loadingIndicator.style.display = "flex";
    resultsContainer.style.display = "none";
    sequenceList.innerHTML = "";

    try {
      const response = await fetch("/api/billing/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurancePlans: rawInsuranceData,
          userNotes: notesElement.value,
        }),
      });

      if (!response.ok) {
        throw new Error("Engine failed to complete coordination analysis.");
      }

      const data = await response.json();

      let tableHtml = `
        <table style="width:100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.9rem;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
              <th style="padding: 8px;">Plan Option</th>
              <th style="padding: 8px;">Type</th>
              <th style="padding: 8px;">Network Tracking Rules</th>
              <th style="padding: 8px; text-align: right;">Price Option</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.comparisons.forEach((plan) => {
        const isConflict = plan.routingWarning.includes("⚠️");
        const isVerified = plan.routingWarning.includes("🎯");

        let warningStyle = "color: #475569;";
        if (isConflict) {
          warningStyle = "color: #b91c1c; font-weight: 600;";
        } else if (isVerified) {
          warningStyle = "color: #047857; font-weight: 500;";
        }

        tableHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px;">
              <strong>${plan.providerName}</strong>
              <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">BIN: ${plan.bin} | PCN: ${plan.pcn}</div>
            </td>
            <td style="padding: 8px; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">${plan.type}</td>
            <td style="padding: 8px; font-size: 0.85rem; ${warningStyle}">
              <div>${plan.notes}</div>
              <div style="font-size: 0.75rem; margin-top: 2px; font-style: italic; opacity: 0.9;">${plan.routingWarning}</div>
            </td>
            <td style="padding: 8px; text-align: right; font-weight: 600; color: #0f172a;">$${plan.cost.toFixed(2)}</td>
          </tr>
        `;
      });

      if (notesElement.value.toLowerCase().includes("cash")) {
        tableHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0; background: #fffdf5;">
            <td style="padding: 8px;">💵 <strong>Pharmabill Preferred Cash Price</strong></td>
            <td style="padding: 8px; font-size: 0.8rem;">CASH</td>
            <td style="padding: 8px; color: #b45309; font-size: 0.85rem;">Standalone Cash Tier Applied</td>
            <td style="padding: 8px; text-align: right; font-weight: 600; color: #b45309;">$45.00</td>
          </tr>
        `;
      }

      tableHtml += `</tbody></table>`;

      let alertsHeader = "";
      if (data.complianceAlert) {
        alertsHeader += `<div style="background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; padding: 12px; border-radius: 4px; margin-bottom: 15px; font-size: 0.85rem; font-weight: 500;">${data.complianceAlert}</div>`;
      }

      if (data.finalCoordinatedCost !== null) {
        alertsHeader += `
          <div style="background: #ecfdf5; border-left: 4px solid #10b981; color: #065f46; padding: 12px; border-radius: 4px; margin-bottom: 12px; font-size: 0.85rem;">
            🎉 <strong>Split-Billing Pricing Optimization Active:</strong> Manufacturer card coordinated with primary plan. Copay reduced to <strong>$${data.finalCoordinatedCost.toFixed(2)}</strong>!
          </div>
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b; color: #78350f; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.8rem;">
            ⚠️ <strong>2026 Copay Accumulator Notice:</strong> Due to active PBM adjustment rules, this manufacturer subsidy value may not count directly toward the user's annual out-of-pocket maximum or deductible ceilings.
          </div>
        `;
      }

      sequenceList.innerHTML = alertsHeader + tableHtml;
      reasoningText.textContent = data.coordinationStrategy;
      resultsContainer.style.display = "block";
    } catch (error) {
      console.error("Frontend Engine Routing Failure:", error);
      alert(
        "Billing Engine Error: Could not determine valid priority mapping.",
      );
    } finally {
      btn.disabled = false;
      loadingIndicator.style.display = "none";
    }
  });
}
