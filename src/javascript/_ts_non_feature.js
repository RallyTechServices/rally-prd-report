/*
 * a model to hold not being a feature
 */

Ext.define('NonFeature',{
    extend:'Ext.data.Model',
    fields:[
        {name:'ObjectID',type:'integer',defaultValue:0},
        {name:'FormattedID',type:'string',defaultValue:"F0"},
        {name:'Parent',type:'string',defaultValue:null},
        {name:'Name',type:'string',defaultValue:"Sans Feature"}
    ]
});