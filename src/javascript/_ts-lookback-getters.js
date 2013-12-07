var user_cache = {};

Ext.define('TSLookbackGetters', {
    singleton:  true,
    getStateChangeAuthor:  function(record, callback){
        TSLookbackGetters.getStateChangeInfo(record,  callback,  "change_author");
    },
    getStateChangeDate:  function(record, callback){
        TSLookbackGetters.getStateChangeInfo(record,  callback,  "change_date");
    },
    getStateChangeInfo:  function(record, callback, flag) {
        var me = this;
        var feature_oid = record.get('ObjectID');

        var state_field = 'State';
        if ( record.get('_type') === 'testcase' ) {
            state_field = 'LastVerdict';
        }
        if ( ! record.get(state_field) ) {
            callback("");
        } else {
            var state = record.get(state_field);
            if ( state.ObjectID ) {
                state = state.ObjectID;
            }
//            if ( record.get('_type') === "task" ) {
//                state = record.get('State').ObjectID;
//            }

            var value = null;

            Ext.create('Rally.data.lookback.SnapshotStore', {
                filters: [
                    {property: 'ObjectID', value: feature_oid},
                    {property: 'State', value: state},
                    {property: '_PreviousValues.State', operator: '!=', value: state},
                    {property: '_PreviousValues.State', operator: 'exists', value: true}
                ],
                fetch:  ['_ValidFrom', '_User'],
                autoLoad:  true,
                listeners:  {
                    scope:  this,
                    load:  function(store, snaps) {

                        Ext.Array.each(snaps, function(snap){
                            var user_oid = snap.get('_User');
                            var change_date = Rally.util.DateTime.fromIsoString(snap.get('_ValidFrom'));

                            if ( flag === "change_date" ) {
                                callback(change_date);
                            } else {
                                if ( user_cache[user_oid] ) {
                                    callback(user_cache[user_oid]);
                                } else {
                                    Ext.create('Rally.data.WsapiDataStore', {
                                        model: 'User',
                                        autoLoad: true,
                                        filters: {property: 'ObjectID', value: user_oid},
                                        listeners:  {
                                            load:  function(store, records){
                                                user_cache[user_oid] = records[0].get('UserName');
                                                callback(user_cache[user_oid]);
                                            }
                                        }
                                    });
                                }
                            }

                        });

                    }
                }
            });
        }
    },
    getScheduleStateChangeAuthor:  function(record, callback){
        TSLookbackGetters.getScheduleStateChangeInfo(record, callback, 'change_author');
    },
    getScheduleStateChangeDate:  function(record, callback){
        TSLookbackGetters.getScheduleStateChangeInfo(record, callback, 'change_date');
    },
    getScheduleStateChangeInfo:  function(record, callback, flag){
        var me = this;
        var story_oid = record.get('ObjectID');
        var schedule_state = record.get('ScheduleState');

        var value = null;

        Ext.create('Rally.data.lookback.SnapshotStore', {
            filters: [
                {property: 'ObjectID', value: story_oid},
                {property: 'ScheduleState', value: schedule_state},
                {property: '_PreviousValues.ScheduleState', operator: '!=', value: schedule_state},
                {property: '_PreviousValues.ScheduleState', operator: 'exists', value: true}
            ],
            fetch:  ['_ValidFrom', '_User'],
            autoLoad:  true,
            listeners:  {
                scope:  this,
                load:  function(store, snaps){
                    Ext.Array.each(snaps, function(snap){
                        var user_oid = snap.get('_User');
                        var change_date = Rally.util.DateTime.fromIsoString(snap.get('_ValidFrom'));

                        if ( flag === "change_date" ) {
                            callback(change_date);
                        } else {
                            if ( user_cache[user_oid] ) {
                                callback(user_cache[user_oid]);
                            } else {
                                Ext.create('Rally.data.WsapiDataStore', {
                                    model: 'User',
                                    autoLoad: true,
                                    filters: {property: 'ObjectID', value: user_oid},
                                    listeners:  {
                                        load:  function(store, records){
                                            user_cache[user_oid] = records[0].get('UserName');
                                            callback(user_cache[user_oid]);
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });
    }
});