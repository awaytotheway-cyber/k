import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The core loop, end to end.
 *
 * An ad click carrying a Facebook click id, followed by a conversion posted
 * from a backend, must appear on the dashboard credited to the right ad with
 * an honest verdict about how much the number can be trusted.
 *
 * This is the one test that must never go red. Everything else in the product
 * is a layer on top of this path, and every part of it — pixel, ingest API,
 * attribution engine, reporting queries — has to work for it to pass.
 */

const PASSWORD = "e2e-core-loop-password";

test.describe("click to attributed revenue", () => {
  test("credits a conversion to the ad that produced it", async ({ page, request }) => {
    const stamp = Date.now();
    const email = `e2e+${stamp}@example.com`;

    // --- 1. A new account, which starts with nothing ----------------------
    const slug = await signUp(page, email);

    await expect(
      page.getByText("Install the tracking snippet"),
      "a new workspace should show onboarding, not an empty dashboard",
    ).toBeVisible();

    // The snippet must carry a real pixel key, or nothing can be tracked.
    const pixelKey = await page
      .locator("code")
      .filter({ hasText: "data-key" })
      .first()
      .textContent()
      .then((text) => /data-key="([^"]+)"/.exec(text ?? "")?.[1]);
    expect(pixelKey, "the snippet should contain a pixel key").toBeTruthy();

    // --- 2. Set a target CAC so verdicts are possible ---------------------
    await page.goto(`/app/${slug}/settings/tracking`);
    await page.fill("#targetCac", "180");
    await page.click('button:has-text("Save settings")');
    await expect(page.getByText("Saved.")).toBeVisible();

    // --- 3. Create an API key, shown exactly once -------------------------
    await page.fill("#label", "e2e");
    await page.click('button:has-text("Create key")');
    await expect(page.getByText("Copy this now")).toBeVisible();
    const apiKey = await page
      .locator("code")
      .filter({ hasText: "tr_live_" })
      .first()
      .textContent();
    expect(apiKey?.startsWith("tr_live_")).toBe(true);

    // --- 4. Import spend so there is a cost to divide ---------------------
    await importSpend(page, slug);

    // --- 5. The ad click lands, carrying its click id ---------------------
    const visitorId = `e2e-visitor-${stamp}`;
    const collected = await request.post("/api/t/collect", {
      headers: { "Content-Type": "text/plain" },
      data: JSON.stringify({
        k: pixelKey,
        v: visitorId,
        // utm_content carries the ad name, which is how Meta accounts are
        // normally tagged. A bare fbclid names the platform but not the ad.
        u:
          `https://acme.example.com/pricing?fbclid=E2E${stamp}` +
          `&utm_source=facebook&utm_medium=cpc&utm_content=${encodeURIComponent("E2E Test Ad")}`,
        r: "https://www.facebook.com/",
      }),
    });
    expect(collected.status(), "the pixel endpoint always accepts").toBe(204);

    // --- 6. They hand over an email ---------------------------------------
    const identified = await request.post("/api/t/identify", {
      headers: { "Content-Type": "text/plain" },
      data: JSON.stringify({ k: pixelKey, v: visitorId, e: `buyer+${stamp}@acme.example.com` }),
    });
    expect(identified.status()).toBe(204);

    // --- 7. The backend reports the trial ---------------------------------
    const conversion = await postConversion(request, apiKey!, {
      eventName: "trial_started",
      eventType: "TRIAL",
      visitorId,
      email: `buyer+${stamp}@acme.example.com`,
      externalId: `e2e_trial_${stamp}`,
    });

    expect(conversion.matchedVisitor, "the conversion should find the visitor").toBe(true);
    expect(
      conversion.attributedTouches,
      "the click should have been credited",
    ).toBeGreaterThan(0);

    // --- 8. Sending it again must not double count ------------------------
    const replay = await postConversion(request, apiKey!, {
      eventName: "trial_started",
      eventType: "TRIAL",
      visitorId,
      email: `buyer+${stamp}@acme.example.com`,
      externalId: `e2e_trial_${stamp}`,
    });
    expect(replay.duplicate, "a repeated conversion is the same conversion").toBe(true);
    expect(replay.id).toBe(conversion.id);

    // --- 9. The dashboard shows it, credited to the right ad --------------
    await page.goto(`/app/${slug}/ads?range=30d`);

    const row = page.locator("tr", { hasText: "E2E Test Ad" });
    await expect(row, "the imported ad should appear with its spend").toBeVisible();
    await expect(row).toContainText("$240");

    // --- 10. And is honest about how little data this is ------------------
    // One conversion against a $180 target cannot support a verdict. If this
    // ever reads "Likely good" or "Likely bad", the confidence layer has
    // stopped protecting people from acting on noise.
    await expect(row, "a single conversion must not produce a verdict").toContainText(
      "Too early",
    );
    await expect(row).toContainText("n=1");

    // --- 11. The conversion history shows the click path ------------------
    await page.goto(`/app/${slug}/conversions?range=30d`);
    await expect(page.getByText(`buyer+${stamp}@acme.example.com`)).toBeVisible();

    await page.locator("details summary").first().click();
    await expect(
      page.getByText("1 visit before converting"),
      "expanding a conversion should show the clicks behind it",
    ).toBeVisible();
    await expect(page.getByText("META")).toBeVisible();
  });

  test("rejects a conversion with no API key", async ({ request }) => {
    const response = await request.post("/api/v1/conversions", {
      data: { eventName: "trial_started" },
    });
    expect(response.status()).toBe(401);
  });

  test("never 500s on a malformed pixel payload", async ({ request }) => {
    // The beacon runs on a customer's site and cannot act on an error, so the
    // endpoint absorbs anything rather than surfacing a console error there.
    for (const body of ["not json", "{}", '{"k":"short"}', ""]) {
      const response = await request.post("/api/t/collect", {
        headers: { "Content-Type": "text/plain" },
        data: body,
      });
      expect(response.status()).toBe(204);
    }
  });
});

// ---------------------------------------------------------------------------

async function signUp(page: Page, email: string): Promise<string> {
  await page.goto("/signup");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#workspaceName", "E2E Co");
  await Promise.all([page.waitForURL(/\/app\//), page.click('button[type="submit"]')]);
  return new URL(page.url()).pathname.split("/")[2]!;
}

/** A one-row spend file, so the ad exists and has a cost. */
async function importSpend(page: Page, slug: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const csv = [
    "Date,Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Link clicks",
    `${today},E2E Campaign,E2E Ad Set,E2E Test Ad,240.00,5000,120`,
  ].join("\n");

  await page.goto(`/app/${slug}/settings/ad-accounts`);
  await page.setInputFiles("#file", {
    name: "e2e-spend.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.click('button:has-text("Import spend")');
  await expect(page.getByText(/Imported 1 rows?/)).toBeVisible();
}

type ConversionResponse = {
  id: string;
  duplicate: boolean;
  matchedVisitor?: boolean;
  attributedTouches: number;
};

async function postConversion(
  request: APIRequestContext,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ConversionResponse> {
  const response = await request.post("/api/v1/conversions", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    data: body,
  });
  expect([200, 201]).toContain(response.status());
  return (await response.json()) as ConversionResponse;
}
