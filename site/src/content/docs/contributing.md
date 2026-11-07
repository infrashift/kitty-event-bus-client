---
title: Contributing
description: How to contribute to KITTY.
---

We welcome contributions from distributed-systems engineers, NATS maintainers, Kiwi linguists, Monty Python animators, and remorseful AI researchers.

1. **Fork the [repository](https://github.com/infrashift/kitty-event-bus-client)** (and star it so the CNCF Technical Oversight Committee notices us).
2. **Create a feature branch:**
   ```bash
   git checkout -b feat/louder-kiwi-cat-meows
   ```
3. **Run it locally** with `make dev`, and run `make test` before you push. See [Local development](/kitty-event-bus-client/guides/development/).
4. **Follow the strict contribution guidelines:**
   - **Package Isolation Mandate.** `kitty/` must never import from `site/` or depend on Astro. The site may only use the package's public `exports`. See [How it's built](/kitty-event-bus-client/guides/architecture/).
   - **Zero Scrollbars Mandate.** If your change causes a `1px` vertical scrollbar on a `375×667` phone, CI will reject it and the cat will judge you.
   - **Speech-Bubble Etiquette.** The bubble must never obscure the cat's eyes or mouth, and must close polite moments after the final chunk is spoken.
   - **Acoustic fidelity.** Changes to `playCatVocalization()` must be tested within earshot of a real domestic housecat. If your cat doesn't perk its ears at the `F1`/`F2` sweep, recalibrate your Q-factors.
   - **Ecological parity.** Keep PR descriptions concise so we don't burn down a third 1⁄100th of the Amazon running CI/CD review bots.
5. **Submit a pull request.**
