"use strict";

Polymer({
  is: 'icon-toggle',
  properties: {
    pressed: {
      type: Boolean,
      notify: true,
      reflectToAttribute: true,
      value: false
    },
    toggleIcon: {
      type: String
    }
  },
  listeners: {
    "tap": "toggle"
  },
  toggle: function () {
    this.pressed = !this.pressed;
  }
});
