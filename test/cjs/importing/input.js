const { thing } = require("./thing.gen");
console.log("The thing is:", thing);
module.exports = function () {
    return myMainExport;
}