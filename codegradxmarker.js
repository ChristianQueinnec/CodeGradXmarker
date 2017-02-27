// Some utilities (in French or English) for CodeGradX.
// Time-stamp: "2017-02-27 14:26:18 queinnec"

/*
Copyright (C) 2016 Christian.Queinnec@CodeGradX.org

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

See https://github.com/paracamplus/Yasmini.git

 This module describes how student's code (and tests) are run and
compared to teacher's code. This plugin is run within CodeGradX
infrastructure to generate the student's report.

*/

(function () {
    // Don't pollute the global environment! It will be used to evaluate
    // the student's code and the teacher's tests.
    
let fs = require('fs');
let fs_writeFileSync = fs.writeFileSync;
let fs_readFileSync = fs.readFileSync;
let fs_renameSync = fs.renameSync;
let vm = require('vm');
let yasmini = require('yasmini');
let util = require('util');
let Promise = require('bluebird');
let he = require('he');

// Re-export yasmini:
module.exports = yasmini;

// preserve that value:
yasmini.original_describe = yasmini.describe;

// Messages in two languages (fr and en):

Object.assign(yasmini.message, {
    fr: {
        startEval: function (code) {
            return "J'évalue <code>" + he.encode(code) + "</code>";
        },
        startEvaluation: function () {
            return "Je vais évaluer votre code.";
        },
        finishEval: function () {
            return "Votre code s'évalue bien.";
        },
        stopEval: function () {
            return "Je m'arrête là!";
        },
        startTests: function () {
            return "Je vais maintenant vérifier votre code avec mes tests.";
        },
        failOwnTests: function () {
            return "Votre code ne passe pas vos propres tests!";
        },
        isAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> est bien une fonction";
        },
        notAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> n'est pas une fonction";
        },
        notSatisfying: function (exc) {
            return "Votre code n'est pas entièrement satisfaisant: <code>" +
                he.encode(exc.toString()) + "</code>";
        },
        bravo: function () {
            return '';
        },
        fail: function (index, actual) {
            return "Échec du test #" + index +
                ": Je n'attendais pas votre résultat: <code>" +
                he.encode(util.inspect(actual)) + "</code>";
        },
        failException: function (index, exception) {
            return "Échec du test #" + index +
                ": Exception signalée: <code>" +
                he.encode(exception) + "</code>";
        },
        fullSuccess: function (expectationSuccessful, expectationAttempted) {
            return "Vous avez réussi " + expectationSuccessful +
                " de mes " + expectationAttempted + " tests.";
        },
        partialSuccess: function (expectationSuccessful, expectationAttempted) {
            return "Vous n'avez réussi que " + expectationSuccessful +
                " de mes " + expectationAttempted + " tests.";
        },
        checkFunction: function (message) {
            return "Je vais tester la fonction <code>" +
                he.encode(message) + "</code>";
        }
    },
    en: {
        startEval: function (code) {
            return "Evaluating <code>" + he.encode(code) + "</code>";
        },
        startEvaluation: function () {
            return "Let's start to evaluate your code.";
        },
        finishEval: function () {
            return "Your code has been correctly loaded.";
        },
        stopEval: function () {
            return "I stop here!";
        },
        startTests: function () {
            return "I'm going to check your code with my tests.";
        },
        failOwnTests: function () {
            return "Your code does not pass your own tests!";
        },
        isAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> exists and is a function.";
        },
        notAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> is not a function!";
        },
        notSatisfying: function (exc) {
            return "Your code is not correct, it raises: <code>" +
                he.encode(exc.toString()) + "</code>";
        },
        bravo: function () {
            return '';
        },
        fail: function (index, actual) {
            return "Failed test #" + index +
                ": I was not expecting your result: <code>" +
                he.encode(util.inspect(actual)) + "</code>";
        },
        failException: function (index, exception) {
            return "Failed test #" + index + ": Exception is: <code>" +
                he.encode(exception) + "</code>";
        },
        fullSuccess: function (expectationSuccessful, expectationAttempted) {
            return "You pass " + expectationSuccessful + " of my " +
                expectationAttempted + " tests.";
        },
        partialSuccess: function (expectationSuccessful, expectationAttempted) {
            return "You only pass " + expectationSuccessful +
                " of my " + expectationAttempted + " tests.";
        },
        checkFunction: function (message) {
            return "I'm going to check function <code>" +
                he.encode(message) + "</code>";
        }
    }
});

yasmini.messagefn = function (key) {
    let translator = yasmini.message[yasmini.lang || 'fr'];
    if ( translator ) {
        let fn = translator[key];
        if ( fn ) {
            let args = Array.prototype.slice.call(arguments, 1);
            return fn.apply(null, args);
        } else {
            return key;
        }
    } else {
        return JSON.stringify(arguments);
    }
};

/* Check student's code with teacher's tests.
   This evaluation is done in the current global environment.
 */

let evalStudentTests_ = function (config, specfile) {
    yasmini.verbalize("+", yasmini.messagefn('startTests'));
    function after (b) {
        yasmini.verbalize("##", "after run_descriptions " + b);
        return b;
    }
    let descriptions = [];
    function _describe (msg, fn) {
        let desc = yasmini.original_describe(msg, fn);
        descriptions.push(desc);
        return desc;
    }
    function run_description (i) {
        yasmini.verbalize("##", "run_description " + i);
        if ( i < descriptions.length ) {
            let desc = descriptions[i];
            return desc.hence(function (d) {
                    yasmini.verbalize("##", "after describe ");
                    if ( !d.pass ) {
                        config.exitCode = 1;
                        if ( d.stopOnFailure ) {
                            return false;
                        }
                    } else {
                        return run_description(i+1);
                    }
                });
        } else {
            yasmini.verbalize("##", "run_description end ");
            return Promise.resolve(true).then(after, after);
        }
    }
    function run_descriptions () {
        return run_description(0);
    }

    // Use the same global context where student's code was evaluated.
    // It contains some yasmini related variables and student's own
    // definitions. For teacher's test code, we setup a new `describe`
    // function:
    global.describe = _describe;
    
    return new Promise(function (resolve, reject) {
        try {
            let src = fs_readFileSync(specfile, 'UTF8');
            vm.runInThisContext(src, { filename: specfile,
                                       displayErrors: true });
            yasmini.verbalize("##", "after loading teacher tests");
            resolve(true);
        } catch (exc) {
            reject(exc);
        }
    }).then(run_descriptions);
};

/* Eval student's code (in the current global environment)
 * Grab functions the exercise asked for, 
 * grab also the descriptions (the unit tests the student wrote).
 * return false to stop the marking process.
*/

let evalStudentCode_ = function (config, codefile) {
    return new Promise(function (resolve /*, reject */) {
        yasmini.verbalize("+", yasmini.messagefn('startEvaluation'));
        // accumulate student's describe() invocations:
        config.student = {
            tests: []
        };
        // This `describe` evaluates and memorizes the
        // descriptions present in student's code.
        function _describe (msg, fn) {
            let desc = { msg: msg, fn: fn, description: undefined };
            config.student.tests.push(desc);
            function fnx () {
                desc.description = this;
                return fn.call(this);
            }
            desc.description = yasmini.original_describe(msg, fnx);
            return desc.description;
        }
        let src = fs_readFileSync(codefile, 'UTF8');
        // Prepare the global environment where will be evaluated
        // the student's code. The students should not alter these
        // global variables but they may use them to write their own tests:
        let current = {
            yasmini:  yasmini,
            describe: _describe,
            it:       yasmini.it,
            expect:   yasmini.expect,
            fail:     yasmini.fail,
            // allow student's code to require some Node modules:
            require:  require
        };
        Object.assign(global, current);
        try {
            // Evaluate student's code in the current global environment:
            vm.runInThisContext(src, { filename: codefile,
                                       displayErrors: true });

            let result = true;
            // Check that student's code is coherent wrt its own tests:
            let coherent = true;
            config.student.tests.forEach(function (d) {
                // FIXME d.description might be not yet fulfilled!!!!!!!!!
                coherent = coherent && d.description.pass;
            });
            if ( config.student.tests.length > 0 && ! coherent ) {
                yasmini.verbalize("--", yasmini.messagefn('failOwnTests'));
                result = false;
            }

            // Check that all required student's functions are present:
            if ( ! config.dontCheckFunctions ) {
                for (let fname in config.functions) {
                    let f = global[fname];
                    if ( typeof f === 'function' ||
                         f instanceof Function ) {
                        let msg = yasmini.messagefn('isAFunction', fname);
                        yasmini.verbalize("+", msg);
                    } else {
                        let msg = yasmini.messagefn('notAFunction', fname);
                        yasmini.verbalize("-", msg);
                        result = false;
                    }
                }
            }
            // Effective 
            resolve(result);
        } catch (exc) {
            // Bad syntax or incorrect compilation throw an Error
            var msg = yasmini.messagefn('notSatisfying', exc);
            msg = msg.replace(/\n/gm, "\n#");
            yasmini.verbalize("--", msg);
            resolve(false);
        }
        resolve(true);
    });
};

/**
 * verbalize some facts. The first argument qualifies the verbalization.
 * -- means error
 * -  is for warning
 * +  is for positive information, feedback

 * @param string        kind of message
 * @param Any...        message fragments
 */
yasmini.verbalize = function (kind) {
    let result = kind + ' ';
    if ( kind === '##' && process && process.uptime ) {
        result += process.uptime() + ' ';
    }
    for (let i=1 ; i<arguments.length ; i++) {
      var item = arguments[i];
      if ( item instanceof String || typeof item === 'string' ) {  
          result += item;
      } else {
          let s = yasmini.imports.util.inspect(arguments[i]);
          result += s;
      }
    }
    yasmini.config.journal.push(result);
    yasmini.printPartialResults_();
};

/** 
 * Record the current state of the tests in a file. This is needed by
 * CodeGradX since tests might be interrupted abruptly if lasting too
 * long. In that case, we want to know how far we tested.
 */
yasmini.printPartialResults_ = function () {
    // Recompute attemptedExpectationsCount and succeededExpectationsCount:
    yasmini.config.attemptedExpectationsCount = 0;
    yasmini.config.succeededExpectationsCount = 0;
    yasmini.config.descriptions.forEach(function (desc) {
      yasmini.config.attemptedExpectationsCount += desc.expectationAttempted;
      yasmini.config.succeededExpectationsCount += desc.expectationSuccessful;
    });
    var msg = "" +
    "ATTEMPTEDEXPECTATIONSCOUNT=" +
    yasmini.config.attemptedExpectationsCount +
    "\nSUCCEEDEDEXPECTATIONSCOUNT=" +
    yasmini.config.succeededExpectationsCount +
    "\nTOTALEXPECTATIONSCOUNT=" +
    yasmini.config.totalExpectationsCount;
    yasmini.config.journal.forEach(function (s) {
      msg += "\n# " + s;
    });
    msg += "\n";
    fs_writeFileSync(yasmini.config.resultFile, msg);
 };

/* Mark student's code.
 * Stop at first failure.
 */

yasmini.markFile = function (config, codefile, specfile) {
    // Make it() global to this module:
    yasmini.config = config;

    // Check student's code with its own tests (if any):
    function postEvalStudentCode (b) {
        yasmini.verbalize("##", 'after evalStudentCode: ' + b);
        function postStudentTests (bb) {
            yasmini.verbalize("##", 'after evalStudentTests: ' + bb);
            if ( ! bb ) {
                yasmini.verbalize("-", yasmini.messagefn('stopEval'));
            }
            return bb;
        }
        if ( b ) {
            yasmini.verbalize("+", yasmini.messagefn('finishEval'));
            return evalStudentTests_(config, specfile)
                .catch(function (exc) {
                    yasmini.verbalize("##",
                      'catch after evalStudentTests: ' + exc);
                    return false;
                })
                .then(postStudentTests);
        } else {
            yasmini.verbalize("-", yasmini.messagefn('stopEval'));
            return false;
        }
    }
    // Catch error in postEvalStudentCode (if any):
    function catchRemains (reason) {
        yasmini.verbalize("##", 'catchRemains: ' + reason);
    }
    yasmini.verbalize("##", 'before evalStudentCode');
    return evalStudentCode_(config, codefile)
        .catch(function (reason) {
            yasmini.verbalize("##", 'catch after evalStudentCode ' + reason);
            return false;
        })
        .then(postEvalStudentCode)
        .catch(catchRemains);
};

// Verbalization

yasmini.class.Expectation.prototype.beginHook = function () {
    // exitCode is initially undefined. We initialize it with 0 as soon
    // as at least one expectation is to be processed:
    if ( ! yasmini.config.exitCode ) {
        yasmini.config.exitCode = 0;
    }
    this.alreadyShownTest = false;
    // Run the endHook of the previous expectation if any:
    let n = this.specification.expectations.length;
    if ( n > 1 ) {
        let previousExpectation = this.specification.expectations[n-2];
        previousExpectation.endHook();
    }
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Expectation.prototype.matchHook = function () {
    var msg;
    if ( ! this.alreadyShownTest ) {
        if ( this.verbose ) {
            msg = 'Test #' + this.index + ' ';
        }
        if ( this.code ) {
            msg = (msg || '') + yasmini.messagefn('startEval', this.code);
        }
        if (msg) {
            yasmini.verbalize('+', msg);
        }
        this.alreadyShownTest = true;
    }
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Expectation.prototype.endHook = function () {
    var msg;
    if ( ! this.runEndHook ) {
        if (this.pass) {
            msg = yasmini.messagefn('bravo');
            yasmini.verbalize('+', msg);
        } else {
            if ( this.raisedException ) {
                msg = yasmini.messagefn(
                    'failException', this.index, this.exception);
            } else {
                msg = yasmini.messagefn('fail', this.index, this.actual);
            }
            yasmini.verbalize('-', msg);
        }
        this.runEndHook = true;
    }
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Specification.prototype.beginHook = function () {
    let msg = this.message;
    yasmini.verbalize('+', msg);
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Specification.prototype.endHook = function () {
    this.update_();
    yasmini.printPartialResults_();
    var msg;
    if (this.pass) {
        // Here expectationAttempted = expectationIntended
        msg = "+ " + yasmini.messagefn('fullSuccess', 
                                       this.expectationSuccessful, 
                                       this.expectationAttempted);
    } else {
        msg = "- " + yasmini.messagefn(
            'partialSuccess',
            this.expectationSuccessful,
            this.expectationIntended ?
                this.expectationIntended :
                this.expectationAttempted );
    }
    yasmini.verbalize(msg);
};

yasmini.class.Description.prototype.beginHook = function () {
    yasmini.config.descriptions.push(this);
    let msg = yasmini.messagefn('checkFunction', this.message);
    yasmini.verbalize("+", msg);
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Description.prototype.endHook = function () {
    this.update_();
    yasmini.printPartialResults_();
};

    // Don't pollute the global environment
})();

// end of codegraxmarker.js
