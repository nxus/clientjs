# nxus-clientjs

## 

## ClientJS Module

[![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)

Compacts, processes and bundles code for inclusion in the browser.  Uses browserify and babel to process source files, and makes
the processed file available via a static route.

### Installation

    npm install nxus-clientjs --save

### Configuration Options

      'clientjs': {
        'babel': {} // Babel specific options. Defaults to the project .babelrc file
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

    npm install --save babel-preset-es2015 babel-preset-react

      'clientjs': {
        'babel': {
          'presets': ['es2015', 'react']
        }

## API

* * *

## includeScript

Injects the passed script into to the specified template

**Parameters**

-   `templateName` **[String](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)** the name of the template to include the script into
-   `script` **\[type]** the path of the script file to include

## bundle

Create a clientjs bundle that can be injected into a rendered page.

**Parameters**

-   `entry` **\[type]** the source file to bundle
-   `output` **\[type]** the output path to use in the browser to access the bundled source
