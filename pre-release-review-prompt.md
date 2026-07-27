# Pre-release review prompt

The prompt I use to have an AI model review this repo before a release — as shown in my video on running Kimi K3 in Zed via OpenRouter. Run it through two different models and compare what each catches; in my test they agreed on exactly one finding and surfaced nine distinct issues between them.

To use it on your own project, swap the **Context** paragraph for one or two lines about your app: what it is, and what the worst failure looks like. That line does more work than anything else in the prompt — the model can't rank by impact if it doesn't know what impact means for your app.

```
You're reviewing this repo before its next release.

Context: GlutenOrNot — a free iOS + web ingredient scanner for people with
celiac disease. React Native app, serverless API. Safety matters more than
features: a wrong "safe" verdict is the worst failure this app can have.

1. Read the last ~20 commits and the current codebase — recent changes are
   where the risk usually sits.
2. Give me the top 5 things to address in my next working session, ranked by
   user impact vs. effort. Bugs and reliability risks first, then performance,
   then cleanup.
3. For each one: a one-line name, the file and line(s), one or two sentences on
   the actual failure or cost, and what you did to verify it's real — not just
   plausible.
4. Anything that looks wrong but you couldn't verify goes in a separate
   "Unverified hunches" list.
5. Skip style nits, dependency-bump advice, and anything a linter would catch.

Be specific enough that I could start fixing #1 immediately.
```

Why it's shaped this way:

- **The context line does the ranking** — it tells the model what kind of failure matters most here.
- **A fixed output shape** (ranked top 5, file:line, evidence) makes two models' answers comparable side by side.
- **"What did you do to verify" + "Unverified hunches"** separates checked findings from confident guesses — the difference you actually care about.
- **The skip-list** keeps both models from padding with generic advice a linter would catch anyway.
