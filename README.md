# nxus-clientjs

## ClientJS

**Extends NxusModule**

[![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)

Compacts, processes and bundles code for inclusion in the browser. Uses
browserify (configured with babelify and minifyify) to process source
files, and makes the processed file available via a static route.

### Installation

    npm install nxus-clientjs --save

### Configuration Options

      'client_js': {
        'babel': {}, // Babel specific options. Defaults to the project .babelrc file
        'routePrefix': '/assets/clientjs', // static route used to serve compiled assets
        'assetFolder': '.tmp/clientjs', // local dir to write compiled scripts
        'webcomponentsURL': 'js/wc-min.js', // URL to include for WC polyfill
        'reincludeComponentScripts': {} // components to ignore from babel compilation but include in scripts
      }

### Usage

To use the module, there are two steps: 1) create the bundle, and 2) include/inject the source into your page.

#### Creating the bundle

    app.get('clientjs').bundle('/my/local/file.js', '/browser/path/to/file.js')

#### Include/inject the source file

You can either include the output path as specified when you creatd the bundle

    <script source='/browser/path/to/file.js'></script>

Or using Nxus Templater, you can inject the script by passing the output path to the `script` key on render or using the Templater 
lifecycle events.

    app.get('templater').render('my-template', {scripts: ['/browser/path/to/file.js']})

Or

    app.get('templater').on('renderContext.my-template', () => {
         return {scripts: ['/browser/path/to/file.js']}
    })

#### Using ClientJS with React (or other babel transforms)

You will need to install the necessary babel presets in your application, and add the config option `babelPresets`, like:

```javascript
    npm install --save babel-preset-es2015 babel-preset-react
```

          'client_js': {
            'babel': {
              'presets': ['es2015', 'react']
            }

The minifyify plugin uses uglify-js, which supports only ECMAScript 5
(ES5) in its released version. If you are supplying ES2015+ (ES6+) code
to clientjs, your `client_js` Babel configuration should specify the
`es2015` preset to avoid parse errors. This is likely to be different
from your server-side Babel configuration, which can rely on native
node.js support for more modern JavaScript features, without Babel
transformation.

### includeScript

Injects the passed script into to the specified template

**Parameters**

-   `templateName` **[String](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)** the name of the template to include the script into
-   `script` **\[type]** the path of the script file to include

### includeComponent

Injects the passed web component into to the specified template

**Parameters**

-   `templateName` **[String](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)** the name of the template to include the script into
-   `script` **\[type]** the path of the component file to include

### bundle

Create a clientjs bundle that can be injected into a rendered page.

**Parameters**

-   `entry` **\[type]** the source file to bundle
-   `output` **\[type]** the output path to use in the browser to access the bundled source
