# Visual Testing Guide

## Overview

Visual regression testing helps detect unintended visual changes in your application. This project uses **Playwright** with screenshot comparison to catch UI regressions.

## Setup

Visual tests are configured in:
- `playwright.config.ts` - Playwright configuration
- `e2e/visual.spec.ts` - Visual regression tests
- `e2e/functional.spec.ts` - Functional/interaction tests

## Running Visual Tests

### First Run (Generate Baseline)
```bash
# Start the server first
npm start

# In another terminal, generate baseline screenshots
npm run test:visual:update
```

This creates a `e2e/__screenshots__/` directory with baseline screenshots.

### Run Tests (Compare Against Baseline)
```bash
# Run tests and compare to baseline
npm run test:visual

# Run tests in headed mode (see browser)
npm run test:visual:headed
```

### Update Screenshots After Intentional Changes
```bash
# After making intentional UI changes
npm run test:visual:update
```

## Tests Included

### Visual Regression Tests
- `index-page.png` - Full page screenshot of deck viewer
- `compare-page.png` - Full page screenshot of comparison tool
- `settings-page.png` - Full page screenshot of settings
- `header.png` - Just the header section
- `navigation.png` - Navigation bar
- `deck-input-form.png` - Deck input form area
- `input-section.png` - Compare page input section
- `index-mobile.png` - Mobile view (375x667)
- `compare-tablet.png` - Tablet view (768x1024)

### Functional Tests
- Navigation between pages
- Recent decks visibility
- Settings page controls
- Direct fetch toggle
- Test connection button
- Load deck buttons
- Reverse button functionality
- Input placeholders
- Error element presence
- Style sheet loading

## Workflow

### 1. Make Changes to Your Code
```bash
# Edit CSS, HTML, or JS files
nano styles.css
```

### 2. Run Visual Tests
```bash
npm run test:visual
```

### 3. Check Results
If tests fail, Playwright shows:
- What changed
- Visual diff (expected vs actual)
- Which elements were affected

### 4. Verify and Update
```bash
# If changes are intentional, update baseline
npm run test:visual:update

# If changes are bugs, fix the code
git diff
```

## HTML Report

After running tests, view the detailed report:
```bash
npx playwright show-report
```

This opens an interactive HTML report showing:
- ✅ Passed tests with screenshots
- ❌ Failed tests with diffs
- Test duration and details

## Masked Elements

Some elements are masked in screenshots to avoid false positives:
- Console/debug output
- Timestamps
- Random data

Add elements to mask in `e2e/visual.spec.ts`:
```typescript
mask: [page.locator('[class*="console"]')]
```

## Best Practices

1. **Commit baseline screenshots to git**
   ```bash
   git add e2e/__screenshots__/
   git commit -m "Add visual test baselines"
   ```

2. **Review diffs carefully**
   - Intentional changes? Update baseline
   - Unintended changes? Fix the bug

3. **Run before merging**
   ```bash
   npm test           # Unit tests
   npm run test:visual # Visual tests
   ```

4. **Test on multiple viewports**
   - Desktop: 1280x720
   - Tablet: 768x1024
   - Mobile: 375x667

5. **Use headed mode for debugging**
   ```bash
   npm run test:visual:headed
   ```

## Integrating with CI/CD

Add to your GitHub Actions (or other CI):

```yaml
name: Visual Tests
on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:visual
```

## Troubleshooting

### Tests Fail on First Run
- Run `npm run test:visual:update` to generate baselines
- Commit screenshots to git

### Screenshots Look Different on CI
- CI might render fonts/colors differently
- Use `--update-snapshots` to regenerate
- Consider using Docker for consistent rendering

### False Positives
- Mask dynamic content (timestamps, counters)
- Use threshold for pixel-level differences
- Check Playwright config `maxDiffPixels`

## Commands Quick Reference

```bash
npm run test:visual          # Run tests
npm run test:visual:update   # Update baselines
npm run test:visual:headed   # See browser while running
npx playwright show-report   # View HTML report
npx playwright codegen       # Record test interactions
```

## Coverage

Current visual tests cover:
- ✅ All main pages (index, compare, settings)
- ✅ Mobile responsive design
- ✅ Tablet responsive design
- ✅ Navigation functionality
- ✅ Form inputs and buttons
- ✅ Settings controls
- ✅ Page layout and styling

## Next Steps

1. Generate baselines: `npm run test:visual:update`
2. Commit: `git add e2e/__screenshots__/ && git commit -m "Initial visual tests"`
3. Make changes confidently knowing visual regressions will be caught!

---

**Visual testing helps catch:**
- ❌ Broken layouts
- ❌ Missing styles
- ❌ Responsive design issues
- ❌ Changed spacing/alignment
- ❌ Color/font regressions
- ✅ But allows intentional changes (when you update snapshots)

