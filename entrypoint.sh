#!/bin/sh

echo "Starting initial scrape..."
echo "Running Tier 1 VCs scraper..."
npm run tier1 || echo "Tier 1 VCs scraper failed"
echo "Running Tier 2 VCs scraper..."
npm run tier2 || echo "Tier 2 VCs scraper failed"
echo "Running funding-rounds scraper..."
npm run funding-rounds || echo "Funding rounds scraper failed"
echo "Running project-details scraper..."
npm run project-details || echo "Project details scraper failed"
echo "Initial scrape complete."

# Keep container running
exec tail -f /dev/null
