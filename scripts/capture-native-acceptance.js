/* eslint-disable @typescript-eslint/no-unused-expressions, no-undef */
async (page) => {
  const outputRoot = "D:/Projects/雅思or算法软件项目/docs/rebuild/screenshots";
  const base = "http://localhost:1420";

  const open = async (hash, ready) => {
    await page.goto(`${base}/#${hash}`);
    await ready();
    await page.waitForTimeout(250);
  };

  const capture = async (width, height, name) => {
    await page.screenshot({
      path: `${outputRoot}/${width}x${height}-${name}.png`,
      scale: "css",
      type: "png",
    });
  };

  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width, height });

    await open("/home", async () => {
      await page.getByRole("heading", { name: /Good (morning|afternoon|evening)\./ }).waitFor();
      await page
        .locator(".home-activity-list button")
        .filter({ hasText: "Alderwick Skills Sampler" })
        .first()
        .waitFor();
    });
    await capture(width, height, "home");

    const completedDemo = page.locator(".home-activity-list button").filter({ hasText: "Alderwick Skills Sampler" }).first();
    await completedDemo.click();
    await page.waitForURL(/#\/review$/);
    await page.getByRole("heading", { name: "Session results" }).waitFor();
    await capture(width, height, "results");

    await open("/library", async () => {
      await page.getByRole("heading", { name: "Library" }).waitFor();
    });
    await capture(width, height, "library");
    await page.getByRole("button", { name: /Cambridge IELTS 17 Academic fallback cover/ }).click();
    await page.getByRole("heading", { name: "Cambridge IELTS 17 Academic" }).waitFor();
    await capture(width, height, "book-detail");

    await open("/practice/reading?packId=original-demo-pack&testId=demo-test-01&mode=study", async () => {
      await page.locator(".reading-workbench").waitFor();
    });
    await capture(width, height, "reading");

    await open("/practice/listening?packId=original-demo-pack&testId=demo-test-01&mode=study", async () => {
      await page.locator(".listening-page").waitFor();
    });
    await capture(width, height, "listening");

    await open("/review?view=queue", async () => {
      await page.getByRole("heading", { name: "Review" }).waitFor();
    });
    await capture(width, height, "review");

    await open("/progress", async () => {
      await page.getByRole("heading", { name: "Progress" }).waitFor();
      await page.waitForFunction(() => (
        document.querySelector(".progress-summary article:nth-child(2) strong")?.textContent?.trim() !== "—"
      ));
    });
    await capture(width, height, "progress");

    await open("/settings", async () => {
      await page.getByRole("heading", { name: "Settings" }).waitFor();
      await page.getByText("D:\\Obsidian\\warehouse", { exact: true }).waitFor();
    });
    await capture(width, height, "settings");
  }

  return { captured: 18, workspace: await page.locator("body").innerText().then((text) => text.includes("IELTS-Workbench-Rebuild-Acceptance-20260917")) };
}
