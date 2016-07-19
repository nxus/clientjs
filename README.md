# nxus-clientjs

## 

[![Build Status](https://travis-ci.org/nxus/clientjs.svg?branch=master)](https://travis-ci.org/nxus/clientjs)

Integration of browserify with Nxus

## Configuration

    "config": {
      "clientjs": {
        "watchify": true,
        "assetPrefix": "/url/prefix/for/generated"
        "entries": {
          "path/source/file.js": "path/output/bundle.js"
        }
      }
    }

## Use with React (or other babel transforms)

You will need to install the necessary babel presets in your application, and add the config option `babelPresets`, like:

    npm install --save babel-preset-es2015 babel-preset-react

    "config": {
      "clientjs": {
        "babel": {
          "presets": ["es2015", "react"]
        }
      }

## API

* * *

## bundle

Create a clientjs bundle that can be injected into a rendered page.

**Parameters**

-   `entry` **\[type]** [description]
-   `output` **\[type]** [description]

Returns **\[type]** [description]
