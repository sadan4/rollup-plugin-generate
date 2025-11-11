import { join } from "path";
import { expect, it } from "vitest";
import { createCJSTestBundle, testBundle } from "../util";
import commonjs from "@rollup/plugin-commonjs";
const dirname = import.meta.dirname;

function createTestBundle(dir: string, entryExt: `.${string}` = ".js") {
  return createCJSTestBundle(join(dirname, dir), entryExt);
}

it("handles cjs importers without extensions", async () => {
    const bundle = await createTestBundle("importing");
    expect(bundle).toMatchInlineSnapshot(`
      [
        "function getDefaultExportFromCjs (x) {
      	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
      }

      function getAugmentedNamespace(n) {
        if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
        var f = n.default;
      	if (typeof f == "function") {
      		var a = function a () {
      			var isInstance = false;
            try {
              isInstance = this instanceof a;
            } catch {}
      			if (isInstance) {
              return Reflect.construct(f, arguments, this.constructor);
      			}
      			return f.apply(this, arguments);
      		};
      		a.prototype = f.prototype;
        } else a = {};
        Object.defineProperty(a, '__esModule', {value: true});
      	Object.keys(n).forEach(function (k) {
      		var d = Object.getOwnPropertyDescriptor(n, k);
      		Object.defineProperty(a, k, d.get ? d : {
      			enumerable: true,
      			get: function () {
      				return n[k];
      			}
      		});
      	});
      	return a;
      }

      const thing = 'imported from cjs without ext';

      var thing_gen = /*#__PURE__*/Object.freeze({
      	__proto__: null,
      	thing: thing
      });

      var require$$0 = /*@__PURE__*/getAugmentedNamespace(thing_gen);

      var input$1;
      var hasRequiredInput;
      function requireInput() {
          if (hasRequiredInput) return input$1;
          hasRequiredInput = 1;
          const { thing } = require$$0;
          console.log("The thing is:", thing);
          input$1 = function() {
              return myMainExport;
          };
          return input$1;
      }

      var inputExports = requireInput();
      var input = /*@__PURE__*/ getDefaultExportFromCjs(inputExports);

      export { input as default };
      ",
      ]
    `);
});
it("handles cjs importers with extensions", async () => {
    const bundle = await createTestBundle("importing-with-ext", ".cjs");
    expect(bundle).toMatchInlineSnapshot(`
      [
        "function getDefaultExportFromCjs (x) {
      	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
      }

      function getAugmentedNamespace(n) {
        if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
        var f = n.default;
      	if (typeof f == "function") {
      		var a = function a () {
      			var isInstance = false;
            try {
              isInstance = this instanceof a;
            } catch {}
      			if (isInstance) {
              return Reflect.construct(f, arguments, this.constructor);
      			}
      			return f.apply(this, arguments);
      		};
      		a.prototype = f.prototype;
        } else a = {};
        Object.defineProperty(a, '__esModule', {value: true});
      	Object.keys(n).forEach(function (k) {
      		var d = Object.getOwnPropertyDescriptor(n, k);
      		Object.defineProperty(a, k, d.get ? d : {
      			enumerable: true,
      			get: function () {
      				return n[k];
      			}
      		});
      	});
      	return a;
      }

      const thing = 'imported from cjs with cjs ext';

      var thing_gen = /*#__PURE__*/Object.freeze({
      	__proto__: null,
      	thing: thing
      });

      var require$$0 = /*@__PURE__*/getAugmentedNamespace(thing_gen);

      var input$1;
      var hasRequiredInput;
      function requireInput() {
          if (hasRequiredInput) return input$1;
          hasRequiredInput = 1;
          const { thing } = require$$0;
          console.log("The thing is:", thing);
          input$1 = function() {
              return myMainExport;
          };
          return input$1;
      }

      var inputExports = requireInput();
      var input = /*@__PURE__*/ getDefaultExportFromCjs(inputExports);

      export { input as default };
      ",
      ]
    `);
})
