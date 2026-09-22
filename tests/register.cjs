// Mocha loads this with --require before any test module, so the DOM globals
// exist by the time @vue/runtime-dom reads `document` during its import.
require('@happy-dom/global-registrator').GlobalRegistrator.register()
// tsx re-execs node and only forwards its own preflight, so hook the DOM
// registration in here: this file is the one --require tsx actually keeps.
require('tsx/preflight')
