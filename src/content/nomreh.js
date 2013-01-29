/**
 * NomrehChrome namespace.
 */
if ("undefined" == typeof(NomrehChrome)) {
  var NomrehChrome = {};
};

/**
 * Controls the browser overlay for the Hello World extension.
 */
NomrehChrome = {
  sayHello : function(aEvent) {
    let stringBundle = document.getElementById("nomreh-string-bundle");
    let message = stringBundle.getString("nomreh.greeting.label");

    window.alert(message);
  }
};
