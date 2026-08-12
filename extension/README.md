# WhyType for VS Code

**The compiler, explaining itself.** A TypeScript error is a chain of
reasoning flattened into a wall of text. WhyType renders it back as the
chain it is: click the lightbulb on any error → **"WhyType: Why does this
fail?"** → read the elaboration as *because → because → because*, with the
type you gave it and the type it expected color-coded at every step.

<!-- TODO before marketplace publish: demo GIF here (record per LAUNCH.md §1) -->

## How it works

No second compiler runs in your editor. WhyType reads the diagnostics your
project's own TypeScript already produced — full tsconfig, imports, and
version fidelity — and parses tsserver's indented elaboration back into a
tree. The webview is static HTML with a locked-down CSP: no scripts, no
network, nothing leaves your machine.

## Use

- Quick fix menu (`Cmd+.` / `Ctrl+.`) on any TypeScript/JavaScript error →
  **WhyType: Why does this fail?**
- Or from the command palette with the cursor on an error.

The playground version — with generic-inference bindings and conditional-type
branch traces — lives at the WhyType site.
