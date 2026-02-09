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
