Ext.define('TSRenderers',{
    singleton: true,

    renderCheck: function(value){
        if ( ! value || value == "false" ) {
            return "";
        } 
        return "<img src='https://us1.rallydev.com/slm/js-lib/rui/builds/rui/resources/themes/images/default/cardboard/slim-cards/ready-icon.png'/>";
    },
    renderPercent: function(value,record,app) {
        if ( ! value ) {
            return "";
        } else {
            return ( 100 * parseFloat(value,10) ) + "%";
        }
    },
    renderByFormattedID: function(value,record,app) {
        if ( ! value ) {
            return "--";
        } else if ( typeof(value.get) === 'function' ){
            return value.get('FormattedID');
        } else {
            return value.FormattedID;
        }
    },
    renderBySavedParent: function(value,record,app) {
        var display_value = "--";
        if ( app && app._feature_parents && record.get('Feature') ) {
            var feature_oid = record.get('Feature').ObjectID;
            if ( app._feature_parents[feature_oid] ) {
                display_value =  app._feature_parents[feature_oid];
            }
        }
        return display_value;
    }
});