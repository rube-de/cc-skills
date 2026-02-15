# [1.14.0](https://github.com/rube-de/cc-skills/compare/v1.13.1...v1.14.0) (2026-02-15)


### Bug Fixes

* address PR review comments ([60b40f5](https://github.com/rube-de/cc-skills/commit/60b40f53456e1d64dde9fbef495b0b5e1d3b189f))
* **dlc:** reclassify failed implementations as Blocked in pr-check Step 4 ([ac1e7f9](https://github.com/rube-de/cc-skills/commit/ac1e7f946de35c04dfd27ef20765d7f316555371))


### Features

* **dlc:** add reviewer enumeration and coverage verification to pr-check ([7974483](https://github.com/rube-de/cc-skills/commit/7974483d21c58b50eb8493785a3c236454d8a6db)), closes [#1](https://github.com/rube-de/cc-skills/issues/1) [#64](https://github.com/rube-de/cc-skills/issues/64)

## [1.13.1](https://github.com/rube-de/cc-skills/compare/v1.13.0...v1.13.1) (2026-02-15)


### Bug Fixes

* add missing kimi-consultant and align partial response thresholds ([e9f12db](https://github.com/rube-de/cc-skills/commit/e9f12dbaa18b6928245362bb822e849dfc13eea1))
* **council:** add namespace prefixes to agent invocation references ([9de5801](https://github.com/rube-de/cc-skills/commit/9de58010d3dbf7cfdefb68283e0996266dd43c7b)), closes [#63](https://github.com/rube-de/cc-skills/issues/63)
* revert namespace prefixes in example output to bare agent names ([62c39a1](https://github.com/rube-de/cc-skills/commit/62c39a16ed5fd5331635b6346cc36647c3869c9a))

# [1.13.0](https://github.com/rube-de/cc-skills/compare/v1.12.6...v1.13.0) (2026-02-14)


### Bug Fixes

* add Task to allowed-tools and clarify fallback wording ([c3f34bd](https://github.com/rube-de/cc-skills/commit/c3f34bd6be7a7b278e052b058e76cc8ac56ee205))


### Features

* implement Explore agent as default discovery mechanism ([505feac](https://github.com/rube-de/cc-skills/commit/505feac4b860915759d87e8a285d6b30f35cc241)), closes [#58](https://github.com/rube-de/cc-skills/issues/58)

## [1.12.6](https://github.com/rube-de/cc-skills/compare/v1.12.5...v1.12.6) (2026-02-14)


### Bug Fixes

* address PR review comments ([bf6559f](https://github.com/rube-de/cc-skills/commit/bf6559f5b97b78df51decd1eaf513da8e7d99c7d))
* **dlc:** add branch verification to pr-check before commit/push ([cb98d73](https://github.com/rube-de/cc-skills/commit/cb98d73e9e9f831b026b82615e30a81962feaec1)), closes [#54](https://github.com/rube-de/cc-skills/issues/54)

## [1.12.5](https://github.com/rube-de/cc-skills/compare/v1.12.4...v1.12.5) (2026-02-14)


### Bug Fixes

* **pm:** clean up /tmp/issue-body.md after successful issue creation ([f960bb5](https://github.com/rube-de/cc-skills/commit/f960bb52c6c62ed192955c95092b67f04a76bef0)), closes [#56](https://github.com/rube-de/cc-skills/issues/56)

## [1.12.4](https://github.com/rube-de/cc-skills/compare/v1.12.3...v1.12.4) (2026-02-14)


### Bug Fixes

* address PR review comments ([739e459](https://github.com/rube-de/cc-skills/commit/739e4591fbf589bab0bc9433b86a7eef984dbf15))
* **cdt:** disable enforce-lead-delegation hook that blocks teammates ([1daf715](https://github.com/rube-de/cc-skills/commit/1daf71504d8ffa38c5b32ad2d94527479f2cb0b8)), closes [#59](https://github.com/rube-de/cc-skills/issues/59)

## [1.12.3](https://github.com/rube-de/cc-skills/compare/v1.12.2...v1.12.3) (2026-02-14)


### Bug Fixes

* **dlc:** address PR review comments on pr-check skill ([deaf313](https://github.com/rube-de/cc-skills/commit/deaf31390ce008f406538ed22f0cb3256d58d1ef))
* **dlc:** prevent premature replies and add PR summary in pr-check ([c86a291](https://github.com/rube-de/cc-skills/commit/c86a291ae4ab0bd28d9cc21782df35c5903e38af)), closes [#55](https://github.com/rube-de/cc-skills/issues/55)
* **dlc:** use ISSUE_NUMBER placeholder instead of #{N} in pr-check templates ([0a9b410](https://github.com/rube-de/cc-skills/commit/0a9b410329bcbe773ba1a39ef7acfd68e6629c8b))

## [1.12.2](https://github.com/rube-de/cc-skills/compare/v1.12.1...v1.12.2) (2026-02-14)


### Bug Fixes

* **cdt:** address council review findings for delegation refactor ([0004403](https://github.com/rube-de/cc-skills/commit/0004403e0f9d3e878af81968298c08ce9ef905a2))
* **cdt:** address PR review comments from CodeRabbit and Copilot ([04c4a07](https://github.com/rube-de/cc-skills/commit/04c4a07410cdf21ca9cd21da8997db00ed194055))
* **cdt:** address second round of PR review comments ([bf25d66](https://github.com/rube-de/cc-skills/commit/bf25d664b6a265fe588ba7d51f5569d3beda9c08))
* **cdt:** inline plan and report templates into teammate spawn prompts ([1e995fa](https://github.com/rube-de/cc-skills/commit/1e995fa02745e5404410d25a6e6fbc3a7702cc3c))

## [1.12.1](https://github.com/rube-de/cc-skills/compare/v1.12.0...v1.12.1) (2026-02-13)


### Bug Fixes

* address PR review comments ([b578463](https://github.com/rube-de/cc-skills/commit/b5784631ecb01657682042c05d34adb4f11bbac0))
* **dlc:** add git push after commit in pr-check skill ([594459d](https://github.com/rube-de/cc-skills/commit/594459da748af7e277767420e4f3ab75a655e23c)), closes [#50](https://github.com/rube-de/cc-skills/issues/50)

# [1.12.0](https://github.com/rube-de/cc-skills/compare/v1.11.0...v1.12.0) (2026-02-13)


### Features

* **pm:** add review sub-skill for single-issue deep validation ([f3c9fda](https://github.com/rube-de/cc-skills/commit/f3c9fdae9fc807672fcbe23b4e5f1f124a809d7c))

# [1.11.0](https://github.com/rube-de/cc-skills/compare/v1.10.1...v1.11.0) (2026-02-13)


### Bug Fixes

* add language identifiers to all bare fenced code blocks in DLC skills ([6513f54](https://github.com/rube-de/cc-skills/commit/6513f54e4aeba7ce7ef623eded44515d95fb199b))
* **dlc:** address council review findings for pr-validity ([a60e3bf](https://github.com/rube-de/cc-skills/commit/a60e3bfaf6b7e47e8c7277327cc1edbf3f8ce64e))
* **dlc:** address PR review comments on pr-validity skill ([67f6c84](https://github.com/rube-de/cc-skills/commit/67f6c848e5a4284b7b8244fb11f4b1a339410be5))


### Features

* **dlc:** add pr-validity sub-skill for duplicate code detection ([e1bbb4c](https://github.com/rube-de/cc-skills/commit/e1bbb4ce3135230af968fbec266ac72645e944c9)), closes [#47](https://github.com/rube-de/cc-skills/issues/47)

## [1.10.1](https://github.com/rube-de/cc-skills/compare/v1.10.0...v1.10.1) (2026-02-13)


### Bug Fixes

* **dlc:** add critical evaluation, user-gated issues, and router dispatch ([26ee494](https://github.com/rube-de/cc-skills/commit/26ee4947c8d4dde0088dc65393a97e730e8f58e4)), closes [#44](https://github.com/rube-de/cc-skills/issues/44)
* **dlc:** remove disable-model-invocation from router ([89d0a9a](https://github.com/rube-de/cc-skills/commit/89d0a9a1ed9173767343782381c1343045400673))

# [1.10.0](https://github.com/rube-de/cc-skills/compare/v1.9.0...v1.10.0) (2026-02-12)


### Bug Fixes

* **pm:** add language tags to fenced code blocks and reply to PR comments ([dac042a](https://github.com/rube-de/cc-skills/commit/dac042af25a1d81647c3d4f21f5fe0f14dbc5dba))
* **pm:** add Skill to allowed-tools for sub-skill routing ([46d5b5f](https://github.com/rube-de/cc-skills/commit/46d5b5f7a427d8498a91577ac8be224a295ef7a7))
* **pm:** address council review findings for scoring, placeholders, and routing ([a993c5f](https://github.com/rube-de/cc-skills/commit/a993c5f16fb61782ec0069c33a341c608e68577f)), closes [N/#M](https://github.com/rube-de/cc-skills/issues/M) [#M](https://github.com/rube-de/cc-skills/issues/M)
* **pm:** address PR review comments for shell safety and docs accuracy ([0f64de3](https://github.com/rube-de/cc-skills/commit/0f64de33bb1c0e8bc3b46226633911934d5f63fe)), closes [#N](https://github.com/rube-de/cc-skills/issues/N)


### Features

* **pm:** convert project-manager to multi-skill router with next and update sub-skills ([b299c16](https://github.com/rube-de/cc-skills/commit/b299c16e88f8086d01225b6d7883f2df899cff22))

# [1.9.0](https://github.com/rube-de/cc-skills/compare/v1.8.0...v1.9.0) (2026-02-11)


### Bug Fixes

* **cdt:** add */ prefix to config allowlist for monorepo support ([8c3a7bc](https://github.com/rube-de/cc-skills/commit/8c3a7bcfe38e16fc4e793604d0a67b85ab7d2b35))
* **cdt:** add detached HEAD guard note to workflow docs ([158ed73](https://github.com/rube-de/cc-skills/commit/158ed732c4556e8dd7f057da207b4f7de587b434))
* **cdt:** add existence guards and document state lifecycle ([8a1de86](https://github.com/rube-de/cc-skills/commit/8a1de8612d9f934da49eb008e26ba0e87db924a1))
* **cdt:** address Copilot review feedback on hooks and docs ([9a34adc](https://github.com/rube-de/cc-skills/commit/9a34adcf6dc8140ca0a6f974b6185b87c8d45ace))
* **cdt:** address round-2 Copilot review feedback ([3b6dca5](https://github.com/rube-de/cc-skills/commit/3b6dca562baccc8e5c21ce1d373efaf38fdf02dd))
* **cdt:** address round-3 Copilot review feedback ([8b86171](https://github.com/rube-de/cc-skills/commit/8b86171b1d6639c4891d5246ff6c0cb19fc25730))
* **cdt:** address round-7 review feedback ([52fdc9a](https://github.com/rube-de/cc-skills/commit/52fdc9ad3ff42146460056c62f54b94d3f5cfb29))
* **cdt:** address round-8 review — fail-closed jq guard, root-anchored configs, silent background sync ([346ec39](https://github.com/rube-de/cc-skills/commit/346ec396ba63be5b402a3de5fe3b85df11f9815e))
* **cdt:** close detached HEAD bypass in enforce-lead-delegation ([b460015](https://github.com/rube-de/cc-skills/commit/b4600158faf8b8987ef3f6c363bbf091100d1f77))
* **cdt:** fail-closed on detached HEAD instead of glob fallback ([d3eb50c](https://github.com/rube-de/cc-skills/commit/d3eb50cad83c0c045e7f0d54fb4653e7df0462b3))
* **cdt:** fail-closed on jq parse errors and add .mjs/.cjs to blocklist ([8033d84](https://github.com/rube-de/cc-skills/commit/8033d84f3d976ed9e058c593c36ce225e0b61c0c))
* **cdt:** quote branch-scoped paths and guard cleanup operations ([7efe8c5](https://github.com/rube-de/cc-skills/commit/7efe8c59b6ecbc44bae56cd612c09c4721e91299))
* **cdt:** tighten config allowlist and fix Closes #N literal ([be40e43](https://github.com/rube-de/cc-skills/commit/be40e439823c5a3ef9ba5925e8a2ec8c986da138)), closes [#N](https://github.com/rube-de/cc-skills/issues/N)
* **cdt:** use branch-scoped state directories for cross-branch safety ([5e30d2a](https://github.com/rube-de/cc-skills/commit/5e30d2a3c54406775e905487b6e700af1733330c))
* **cdt:** use explicit if/fi guards and jq fallback in hook scripts ([18c77c1](https://github.com/rube-de/cc-skills/commit/18c77c1723f067d78313d4b93e54858c02ddf825))
* **docs:** correct PR reference [#42](https://github.com/rube-de/cc-skills/issues/42) → [#41](https://github.com/rube-de/cc-skills/issues/41) in learnings.md ([f62b79c](https://github.com/rube-de/cc-skills/commit/f62b79cb45a9ec3b3f4d840dcb789b066b652c75))


### Features

* **cdt:** enforce lead delegation via PreToolUse hooks ([76b9de9](https://github.com/rube-de/cc-skills/commit/76b9de98c50d5d795586d6b2f4a49a76c41a52bc)), closes [#32](https://github.com/rube-de/cc-skills/issues/32)
* **cdt:** integrate GitHub issue lifecycle with team workflows ([dafc290](https://github.com/rube-de/cc-skills/commit/dafc290e62ca1771fea6b7a970c0428c76ebbd57))

# [1.8.0](https://github.com/rube-de/cc-skills/compare/v1.7.4...v1.8.0) (2026-02-10)


### Features

* **dlc:** add Dev Life Cycle quality gates plugin ([ef02cef](https://github.com/rube-de/cc-skills/commit/ef02cef4787c497d656ce330d5e2c4f953a9ce83)), closes [#39](https://github.com/rube-de/cc-skills/issues/39)

## [1.7.4](https://github.com/rube-de/cc-skills/compare/v1.7.3...v1.7.4) (2026-02-10)


### Bug Fixes

* **council:** address Copilot review comments ([6b499b5](https://github.com/rube-de/cc-skills/commit/6b499b5a0e90ba960a8c44ad61f72a3214725497))
* **council:** replace hierarchical escalation with parallel triage in /council quick ([cecf2c1](https://github.com/rube-de/cc-skills/commit/cecf2c19d4607e4577f3d995f638009ac51ecd7c))

## [1.7.3](https://github.com/rube-de/cc-skills/compare/v1.7.2...v1.7.3) (2026-02-10)


### Bug Fixes

* address Copilot review comments ([80a3168](https://github.com/rube-de/cc-skills/commit/80a3168d73ddfcf7e6c8f41829c69d47ed1a430b))
* **jules-review:** use imperative directives for WORKFLOW.md loading ([047e265](https://github.com/rube-de/cc-skills/commit/047e265a9294206ba792d3cb11c4d36cc622c9bd))

## [1.7.2](https://github.com/rube-de/cc-skills/compare/v1.7.1...v1.7.2) (2026-02-10)


### Bug Fixes

* **council:** align quick escalation thresholds and structured prompt ([9897958](https://github.com/rube-de/cc-skills/commit/9897958f21983f904efa097a500943ab2838e449))

## [1.7.1](https://github.com/rube-de/cc-skills/compare/v1.7.0...v1.7.1) (2026-02-10)


### Bug Fixes

* **jules-review:** use backtick-wrapped [@jules](https://github.com/jules) for AI recognition ([4765a1a](https://github.com/rube-de/cc-skills/commit/4765a1a87bf4efa54ad76d3c2ffbd563f1f6a23a))

# [1.7.0](https://github.com/rube-de/cc-skills/compare/v1.6.3...v1.7.0) (2026-02-10)


### Bug Fixes

* **jules-review:** address review feedback from Copilot and Claude ([e8fae51](https://github.com/rube-de/cc-skills/commit/e8fae511a497c8ca12addc973bf7d1f078ec1bdb))


### Features

* **jules-review:** add Jules PR review plugin ([fb22261](https://github.com/rube-de/cc-skills/commit/fb222611851d0851b5e7066d0ae6b6e195bf33b9)), closes [#29](https://github.com/rube-de/cc-skills/issues/29)

## [1.6.3](https://github.com/rube-de/cc-skills/compare/v1.6.2...v1.6.3) (2026-02-10)


### Bug Fixes

* **council:** address review — add documentation type, fix Kimi gaps ([96a0a3c](https://github.com/rube-de/cc-skills/commit/96a0a3c6639e175be484b5ab35978540feb02a09))

## [1.6.2](https://github.com/rube-de/cc-skills/compare/v1.6.1...v1.6.2) (2026-02-09)


### Bug Fixes

* **cdt:** move shared plan/dev workflows to skill references ([c3a65c1](https://github.com/rube-de/cc-skills/commit/c3a65c193dbb2106d2c0c5110fab6cf3347b856f))

## [1.6.1](https://github.com/rube-de/cc-skills/compare/v1.6.0...v1.6.1) (2026-02-09)


### Bug Fixes

* **cdt:** resolve timestamp conflicts flagged in PR review ([f08bf1c](https://github.com/rube-de/cc-skills/commit/f08bf1cb4c8faaf908dffec4e7cbe5adc7deed31))
* **cdt:** use [@references](https://github.com/references) for plan-task and dev-task in orchestration commands ([c588976](https://github.com/rube-de/cc-skills/commit/c5889761231650d1a4619eba57e78ecbbfd500da))

# [1.6.0](https://github.com/rube-de/cc-skills/compare/v1.5.0...v1.6.0) (2026-02-09)


### Bug Fixes

* **cdt:** address review feedback on auto-branching and task naming ([1ca3d23](https://github.com/rube-de/cc-skills/commit/1ca3d23a4cc5791a10fa73321da65312fa19d550))
* **cdt:** Git Check ensures default branch before branching ([690a246](https://github.com/rube-de/cc-skills/commit/690a2464a266b2e9d3f5287271484dacb27e9d4c))


### Features

* **cdt:** add ADR documentation, auto-branching, always-on QA-tester ([85b3c4a](https://github.com/rube-de/cc-skills/commit/85b3c4aeea1063579f15543cec23827ef08d3704)), closes [#25](https://github.com/rube-de/cc-skills/issues/25)

# [1.5.0](https://github.com/rube-de/cc-skills/compare/v1.4.0...v1.5.0) (2026-02-09)


### Bug Fixes

* **project-manager:** address review feedback on requirements challenge phase ([51cd604](https://github.com/rube-de/cc-skills/commit/51cd6048ea1c1b133a3359d6ec1580c7886fa00a))


### Features

* **project-manager:** add critical requirements challenge phase with -quick mode ([94dae45](https://github.com/rube-de/cc-skills/commit/94dae4549a8b345efd998ecb81d91b8d259dd95e)), closes [#20](https://github.com/rube-de/cc-skills/issues/20)

# [1.4.0](https://github.com/rube-de/cc-skills/compare/v1.3.0...v1.4.0) (2026-02-09)


### Features

* add oasis-dev plugin for Oasis Network development ([7354d8e](https://github.com/rube-de/cc-skills/commit/7354d8ef5c07a33366a59512778783a75b7962f7))
* **plugin-dev:** auto-update root docs when scaffolding new plugins ([5e1d314](https://github.com/rube-de/cc-skills/commit/5e1d314c23c7416beeb5e8d754a31278afe39148))

# [1.3.0](https://github.com/rube-de/cc-skills/compare/v1.2.6...v1.3.0) (2026-02-09)


### Features

* add oasis-dev plugin for Oasis Network development ([d78281b](https://github.com/rube-de/cc-skills/commit/d78281b98a2ebe9eb3dd92be8c5a4c898cb245db))

## [1.2.6](https://github.com/rube-de/cc-skills/compare/v1.2.5...v1.2.6) (2026-02-08)


### Bug Fixes

* **cdt:** block /cdt commands when Agent Teams is not enabled ([5591b70](https://github.com/rube-de/cc-skills/commit/5591b70fae63dd978bd13317effedb70f40e4db2))
* **release:** update all plugin versions on release ([1431b90](https://github.com/rube-de/cc-skills/commit/1431b906ebc2636be68d5f8d7b482b20d98e60ba))

## [1.2.5](https://github.com/rube-de/cc-skills/compare/v1.2.4...v1.2.5) (2026-02-08)


### Bug Fixes

* **doppler:** clean apt cache in Dockerfile pattern ([#18](https://github.com/rube-de/cc-skills/issues/18)) ([7f78b40](https://github.com/rube-de/cc-skills/commit/7f78b40fc1de868cd6dde0c7bdbb0ac93ceb7a67)), closes [#16](https://github.com/rube-de/cc-skills/issues/16)

## [1.2.4](https://github.com/rube-de/cc-skills/compare/v1.2.3...v1.2.4) (2026-02-08)


### Bug Fixes

* **cdt:** use Teammate tool instead of Task tool for spawning agent teammates ([23e9feb](https://github.com/rube-de/cc-skills/commit/23e9feb7350373daee99b63eb14f6210800fe06a))

## [1.2.3](https://github.com/rube-de/cc-skills/compare/v1.2.2...v1.2.3) (2026-02-08)

## [1.2.2](https://github.com/rube-de/cc-skills/compare/v1.2.1...v1.2.2) (2026-02-08)

## [1.2.1](https://github.com/rube-de/cc-skills/compare/v1.2.0...v1.2.1) (2026-02-08)

# [1.2.0](https://github.com/rube-de/cc-skills/compare/v1.1.1...v1.2.0) (2026-02-08)


### Bug Fixes

* add graceful shutdown wait and delegate mode tip to CDT cleanup procedures ([d787680](https://github.com/rube-de/cc-skills/commit/d787680e860fa4be021d967762e5fa27c5376030))
* use "teammate" phrasing in CDT commands for reliable Agent Teams triggering ([e8cb6e6](https://github.com/rube-de/cc-skills/commit/e8cb6e6de307a54e4d7d1fe8f72816e49f0e1fb7))


### Features

* split CDT tester into code-tester and conditional ux-tester ([0670054](https://github.com/rube-de/cc-skills/commit/06700549342b4657be8b9268cbb623dd37da3c31))

## [1.1.1](https://github.com/rube-de/cc-skills/compare/v1.1.0...v1.1.1) (2026-02-08)

# [1.1.0](https://github.com/rube-de/cc-skills/compare/v1.0.2...v1.1.0) (2026-02-08)


### Bug Fixes

* use GitHub App token in release workflow to bypass branch protection ([cbd979c](https://github.com/rube-de/cc-skills/commit/cbd979c3b0a2264262c13fa71ba2388c5d748808))


### Features

* add Doppler secrets management skill plugin ([3bc6f27](https://github.com/rube-de/cc-skills/commit/3bc6f27193ebbbc408e6d2782f87964e69064aca))
* add plugin-dev plugin for scaffolding, validation, and hook auditing ([c189b87](https://github.com/rube-de/cc-skills/commit/c189b870afbb7dfdd0ebeacabc1b4167b419a777))
* add Temporal durable execution skill plugin ([de339c8](https://github.com/rube-de/cc-skills/commit/de339c8c401399ba004e0300f91967565f368d91))
* rename claude-dev-team to cdt, add datetime postfix and git workflow ([77f6c92](https://github.com/rube-de/cc-skills/commit/77f6c92fe0591a81217ecd5887916297dcd4cf72))

## [1.0.2](https://github.com/rube-de/cc-skills/compare/v1.0.1...v1.0.2) (2026-02-07)

## [1.0.1](https://github.com/rube-de/cc-skills/compare/v1.0.0...v1.0.1) (2026-02-07)


### Bug Fixes

* align versions to v1.0.0 and add semantic-release version bumping ([beac101](https://github.com/rube-de/cc-skills/commit/beac1010c5f32ab3216af0ecffbc7be1de7d6e35))

# 1.0.0 (2026-02-07)


### Bug Fixes

* rename marketplace to rube-cc-skills, add CI/CD, and improve README ([ce6e9d6](https://github.com/rube-de/cc-skills/commit/ce6e9d625b15e3ea0736d2178aca4a00790e13dc))


### Features

* add claude-dev-team plugin, slim council entry ([d093167](https://github.com/rube-de/cc-skills/commit/d0931679a7e02abbba331cdb86968ea3e48eb06d))
* add marketplace tooling, docs, and release infrastructure ([779a43a](https://github.com/rube-de/cc-skills/commit/779a43a499356bc8f8b15a35cd4db1d614dfd714))
* add project-manager skill as local plugin ([c00c397](https://github.com/rube-de/cc-skills/commit/c00c3973765cd3764aec00209b216a7711079fe1))
* consolidate all plugins into monorepo ([82cd607](https://github.com/rube-de/cc-skills/commit/82cd607e9fe4f58ae971097bf108838169b2b25f))
* initialize rube-marketplace with council plugin ([8d82914](https://github.com/rube-de/cc-skills/commit/8d8291490ca54de0070b3fe305707d418523b973))
