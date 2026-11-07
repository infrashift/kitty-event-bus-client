# KITTY-EVENT-BUS-CLIENT: a Bun workspace with two packages, driven by make.
#   kitty/  the Vue app & component package (kitty-event-bus-client)
#   site/   the Astro + Starlight docs site, which hosts the package as an island
# Run `make` (or `make help`) to list targets.

BUN  ?= bun
HOST ?= 0.0.0.0
PORT ?= 4321

# Local NATS server (`make nats`). Podman is the default; `make nats CONTAINER=docker` works too.
CONTAINER     ?= podman
NATS_IMAGE    ?= docker.io/library/nats:2.11-alpine
NATS_BOX      ?= docker.io/natsio/nats-box:latest
NATS_NAME     ?= kitty-nats
NATS_NET      ?= kitty-nats
NATS_PORT     ?= 4222
NATS_WS_PORT  ?= 8080
NATS_WS_URL   ?= ws://localhost:$(NATS_WS_PORT)

.DEFAULT_GOAL := help
.PHONY: help install kitty-dev kitty-build kitty-build-app dev build preview \
        test kitty-test site-test test-install test-report pack clean \
        nats nats-stop nats-logs nats-box nats-publish

help: ## List available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\n"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

node_modules: package.json kitty/package.json site/package.json bun.lock
	$(BUN) install
	@touch node_modules

install: ## Install dependencies for the whole workspace with bun
	$(BUN) install

# ---- kitty/ : the Vue package ---------------------------------------------------------

kitty-dev: node_modules ## Work on the app alone (Vite harness) at http://localhost:4321/
	cd kitty && $(BUN) run dev -- --host $(HOST) --port $(PORT)

kitty-build: node_modules ## Build the package → kitty/dist/ (ES lib, IIFE, style.css, types, tts/)
	cd kitty && $(BUN) run build

kitty-build-app: node_modules ## Build the standalone harness → kitty/dist-app/ (for kitty's tests)
	cd kitty && $(BUN) run build:app

# ---- site/ : the Astro + Starlight site ------------------------------------------------

dev: kitty-build ## Site dev server at http://localhost:4321/kitty-event-bus-client/
	cd site && $(BUN) run dev -- --host $(HOST) --port $(PORT)

build: kitty-build ## Build the package, then the site → site/dist/
	cd site && $(BUN) run build

preview: build ## Serve the production site build
	cd site && $(BUN) run preview -- --host $(HOST) --port $(PORT)

# ---- tests -----------------------------------------------------------------------------

test-install: node_modules ## One-time: download Playwright's Chromium (CI adds --with-deps)
	cd kitty && $(BUN) x playwright install $(if $(CI),--with-deps) chromium

kitty-test: kitty-build-app ## Playwright suite for the app on its own
	cd kitty && $(BUN) x playwright test $(ARGS)

site-test: build ## Playwright suite for the site (+ live NATS tests when NATS_WS_URL is set)
	cd site && $(BUN) x playwright test $(ARGS)

test: kitty-test site-test ## Both suites, headless, on all screen sizes

test-report: ## Open the last HTML reports (kitty on :9323, site on :9324; Ctrl-C stops both)
	@trap 'kill 0' INT TERM; \
	  (cd kitty && $(BUN) x playwright show-report --port 9323) & \
	  (cd site && $(BUN) x playwright show-report --port 9324) & \
	  wait

pack: kitty-build ## Dry-run `bun pm pack`: what would be published to npm
	cd kitty && $(BUN) pm pack --dry-run

clean: ## Remove build output, caches, test results, and node_modules
	rm -rf node_modules kitty/node_modules site/node_modules \
	  kitty/dist kitty/dist-app site/dist site/.astro site/public/kitty \
	  kitty/test-results kitty/playwright-report site/test-results site/playwright-report

# ---- a local NATS server (podman by default) ----------------------------------------------

nats: ## Start a local NATS server: nats://localhost:4222 + WebSocket ws://localhost:8080
	@$(CONTAINER) network exists $(NATS_NET) 2>/dev/null || $(CONTAINER) network inspect $(NATS_NET) >/dev/null 2>&1 \
	  || $(CONTAINER) network create $(NATS_NET) >/dev/null
	$(CONTAINER) run -d --rm --name $(NATS_NAME) --network $(NATS_NET) \
	  -p $(NATS_PORT):4222 -p $(NATS_WS_PORT):8080 \
	  -v "$(CURDIR)/nats/kitty-dev.conf:/etc/nats/kitty.conf:ro,Z" \
	  $(NATS_IMAGE) -c /etc/nats/kitty.conf
	@echo "NATS is up. Open the speaker with ?nats=$(NATS_WS_URL)"

nats-stop: ## Stop the local NATS server
	-$(CONTAINER) stop $(NATS_NAME)

nats-logs: ## Follow the local NATS server's logs
	$(CONTAINER) logs -f $(NATS_NAME)

nats-box: ## Interactive nats-box shell (nats CLI) connected to the local server
	$(CONTAINER) run --rm -it --network $(NATS_NET) -e NATS_URL=nats://$(NATS_NAME):4222 $(NATS_BOX)

nats-publish: node_modules ## Publish sample CloudEvents (structured + binary mode) to the local server
	$(BUN) site/scripts/nats-publish.ts $(NATS_WS_URL)
