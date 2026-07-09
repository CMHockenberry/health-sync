# Health Ledger

Standalone build of the health tracking app, for GitHub Pages hosting.

## Local dev
npm install
npm run dev

## Build
npm run build
Output goes to dist/ — that's what gets deployed to GitHub Pages.

## Deploy to GitHub Pages
1. Create a new repo on github.com (public, since GitHub Pages on the free
   plan requires public repos — or use a private repo if you're on GitHub Pro/Team).
2. From this folder:
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
     git push -u origin main
3. Build and push the compiled output to a gh-pages branch:
     npm run build
     npx gh-pages -d dist
   (This needs the gh-pages package: npm install --save-dev gh-pages)
4. On GitHub: repo Settings -> Pages -> Source -> Deploy from branch ->
   select "gh-pages" branch, "/ (root)" folder -> Save.
5. Wait a minute or two, then visit https://YOUR_USERNAME.github.io/YOUR_REPO/
6. Open that URL in mobile Safari -> Share -> Add to Home Screen. It should
   now use the real app icon and open without Safari's address bar.

## Data / privacy note
This build stores all data in the browser's localStorage on whichever device
opens it — nothing is sent to a server. That also means data does not sync
between devices (e.g. opening it on a different phone starts fresh), and
clearing Safari's site data will erase it. If you want cross-device sync
later, that requires adding a real backend, which this static version
doesn't have.
