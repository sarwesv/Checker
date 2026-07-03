# Vintage Checkers

A vintage, parlour-style checkers (draughts) game that runs entirely in the
browser — no build step, no dependencies. The board is rendered from a
bird's-eye (top-down) view on a wood-grained, brass-trimmed board.

## Features

- **Play a bot** with a difficulty slider from 1 (total beginner) to 10
  (grandmaster). Strength is driven by a minimax search with alpha-beta
  pruning; lower settings search less deeply and occasionally blunder.
- **Two players, one device** — pass-and-play mode for a friend across the
  table.
- Full American/English draughts rules: mandatory captures, chained
  multi-jumps, and king promotion.
- **Hints** — get a suggested move (computed at a strong search depth) to
  help you improve.
- Move log, capture tally, undo, and a sound toggle for tactile wooden
  clacks.

## Running locally

This is a static site — just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

A workflow at `.github/workflows/deploy-pages.yml` builds and deploys the
site automatically on every push to `main`, using GitHub's official Pages
actions.

**One-time setup:** in the repository on GitHub, go to
**Settings → Pages → Build and deployment → Source**, and select
**"GitHub Actions."** After that, every push to `main` will publish the
latest version automatically.
