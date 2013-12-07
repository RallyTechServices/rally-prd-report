Ext.define('CustomApp',  {
    extend:  'Rally.app.App',
    componentCls:  'app',

    _feature_parents:  {},  /* key is feature objectID */
    _feature_oids:  [],
    _records:  {},  /* key is objectID,  a place that we keep all the records */

    _async_flags:  {},  /* for collating all the async calls */
    /**
     * _csv_fields is used to define the headers and content of the csv file.
     *
     *  The dataIndex should be the same as the record type's dataIndex
     *  UNLESS:
     *
     *  the different records will do something with the same field (like "state/schedule state"
     *  the field is a reference to an object
     *  the field will be gathered via a separate asynchronous call (e.g.,  to the lookback api)
     *
     *  In all the UNLESS cases,  put the name of the csvIndex into the dataIndex here AND THEN
     *  make sure that the csvIndex is set on the appropriate _<recordtype>_fields call.
     *
     *  See how Team/Project is handled,  for example
     */
    _csv_fields:  [
        {text: 'Project', dataIndex: '__project'},
        {text: 'Request', dataIndex: '__request'},
        {text: 'Feature', dataIndex: '__feature'},
        {text: 'WorkProduct', dataIndex: '__workProduct'},
        {text: 'Formatted ID', dataIndex: 'FormattedID'},
        {text: 'Name', dataIndex: 'Name'},
        {text: 'State', dataIndex: '__state'},
        {text: 'F - % Done By Story Count', dataIndex: '__doneByCount'},
        {text: 'F - ICD(s)', dataIndex: 'ICDsReqd'},
        {text: 'F - CR#', dataIndex: 'CR'},
        {text: 'F - PIRR', dataIndex: 'PIRR'},
        {text: 'US - CR#', dataIndex: 'CR', csvIndex: '__cr'},  /**because the same field name is on features***/
        {text: 'US - Story Source', dataIndex: 'StorySource'},
        {text: 'TA - Task Type', dataIndex: 'TaskType'},
        {text: 'TA - Code Review', dataIndex: 'CodeReview'},
        {text: 'TA - Unit Test', dataIndex: 'UnitTest'},
        {text: 'TA - Dependencies Identified', dataIndex: 'DependenciesIdentified'},
        {text: 'TA - Chg Man Pkg', dataIndex: 'Changeman Package'},
        {text: 'State Date', dataIndex: '__stateChangedDate'},
        {text: 'State Changed By', dataIndex: '__stateChangedBy'}

    ],
    _feature_fields: [
        {dataIndex: 'Parent', text: 'Request', renderer: TSRenderers.renderByFormattedID,  csvIndex: '__request'},
        {dataIndex: 'Project', text: 'Team', csvIndex: '__team'},
    ],

    _story_fields: [
        {dataIndex: 'Project', text: 'Project', csvIndex: '__project'},
        {dataIndex: 'Feature', text: 'Feature', renderer: TSRenderers.renderByFormattedID, csvIndex: '__feature'},
        {dataIndex: 'Name', text: 'Requirement', csvIndex: '__storyname'}
    ],

    _testcase_fields: [
        {dataIndex: 'LastVerdict', text: 'State', csvIndex: '__state'},
        {dataIndex: 'Project', text: 'Team', csvIndex: '__team'},
//        {dataIndex: TSLookbackGetters.getStateChangeAuthor, text: 'State Changed By', csvIndex: '__stateChangedBy'},
//        {dataIndex: TSLookbackGetters.getStateChangeDate, text: 'State Date', csvIndex: '__stateChangedDate'},
        {dataIndex: 'Feature', text: 'Feature', renderer: TSRenderers.renderByFormattedID, csvIndex: '__feature'},
        {dataIndex: 'Request', text: 'Request', renderer: TSRenderers.renderBySavedParent, csvIndex: '__request'},
        {dataIndex: 'WorkProduct', text: 'Work Product', renderer: TSRenderers.renderByFormattedID, csvIndex: '__workProduct'}
    ],


    logger:  new Rally.technicalservices.Logger(),

    items: [
        {
            xtype: 'container', itemId: 'selector_outer_box', layout: {type: 'hbox'}, padding: 10,
            items: [
                {xtype: 'container', itemId: 'type_box',  margin: 5},
                {xtype: 'container', itemId: 'selector_box',  margin: 5},
                {xtype: 'container', itemId: 'button_box', margin: 5}
            ]
        },
        {
            xtype: 'container',
            itemId: 'report_box',
            padding: 10
        },
        {
            xtype: 'tsinfolink'
        }
    ],

    launch:  function() {
        this.logger.log("Launching with context", this.getContext());
        this._addTypeSelector();
    },

    _addTypeSelector:  function(){
        var me = this;
        var states = Ext.create('Ext.data.Store',  {
            fields:  ['value',  'name'],
            data :  [
                {"value": "Tags",  "name": "Tagged Features"},
                {"value": "Feature",  "name": "Feature List"}
            ]
        });

        // Create the combo box,  attached to the states data store
        this.down('#type_box').add(Ext.create('Ext.form.ComboBox',  {
            fieldLabel:  'Selector Type',
            store:  states,
            queryMode:  'local',
            displayField:  'name',
            valueField:  'value',
            labelWidth:  80,
            listeners:  {
                scope:  this,
                change:  function(box, new_value){
                    this.down('#selector_box').removeAll();
                    this.down('#button_box').removeAll();

                    if ( new_value === "Release" ) {
                        this._addReleaseSelector();
                    } else {
                        this._addFeatureChooser();
                    }
                }
            }
        }));
    },

    _addReleaseSelector:  function() {
        var me = this;
        this.down('#selector_box').add({
            xtype: 'rallyreleasecombobox',
            itemId: 'releasebox',
            fieldLabel:  'Release: ',
            labelWidth:  50,
            listeners:  {
                change:  function(rb){
                    me._getFeatures();
                },
                ready:  function(rb){
                    me._getFeatures();
                }
            },
            value:  me._selected_release
        });
    },

    _addFeatureChooser:  function() {
        this.down('#selector_box').add({
            xtype:  'rallymultiobjectpicker',
            itemId: 'featurebox',
            modelType:  'portfolioitem/feature',
            listeners:  {
                scope:  this,
                blur:  function(box) {
                    if ( box.getValue().length > 0 ) {
                        this._getFeatures();
                    }
                }
            }
        });
    },

    _getIndices:  function(hashes){
        var indices = [];
        Ext.Array.each(hashes, function(hash){
            if ( typeof(hash.dataIndex) === "string" ) {
                indices.push(hash.dataIndex);
            }
        });
        return indices;
    },

    _buildFeatureHTML:  function(feature, html) {
        var me = this;
        if ( feature.get('Parent') ) {
            // save parent for future use
            me._feature_parents[feature.get('ObjectID')] = feature.get('Parent').FormattedID;
        }

        html.push("<div class='ts-feature' id='" + feature.get('ObjectID') + "'>");
            html.push("<span class='ts-feature-headline'>" + feature.get('FormattedID') + ":  " + feature.get('Name') + "</span>");
            // show details for selected fields
            if ( feature.get('ObjectID') ) {
                html.push("<div class='ts-feature-details'>");
                    Ext.Array.each(me._feature_fields, function(field){
                        html.push("<div><i>" + field.text + "</i>:  " + me._render(feature, field) + "</div>");
                    });
                html.push("</div>");
            }
            // make a container for the stories
            html.push("<div class='ts-story-divider'>Stories</div>");
            html.push("<div id='childof" + feature.get('ObjectID') + "' class='ts-story'>");
            html.push("</div></div>");

        html.push("</div>");
    },

    _resetData:  function() {
        this.down('#report_box').update();
        this._feature_parents = {};
        this._features = [];
        this._records = [];
    },

    _getFeatures:  function() {
        var me = this;
        this.logger.log('_getFeatures');
        this._resetData();

        this.down('#button_box').removeAll();

        if ( this.down('#selector_outer_box').getEl() ) {
            this.down('#selector_outer_box').getEl().mask("Loading...");
        }

        var filters = [];
        var search_type = "release";

        if ( this.down('#releasebox') ) {
            var release = this.down('#releasebox').getRecord();
            this.logger.log('release', release.get('Name'));
            filters.push({property: 'Release.Name', value: release.get('Name')});
        } else {
            search_type = "features";
            var values = this.down('#featurebox').getValue();
            Ext.Array.each(values, function(value){
                filters.push({property: 'ObjectID', value: value.get('ObjectID')});
            });
            this.logger.log('filters', filters);
        }

        var filter_object = Ext.create('Rally.data.QueryFilter', filters[0]);
        for ( var i=1; i<filters.length; i++ ) {
            filter_object = filter_object.or(Ext.create('Rally.data.QueryFilter', filters[i]));
        }

        var fetch = Ext.Array.push(
            ['ObjectID', 'FormattedID', 'Name'],
            this._getIndices(this._feature_fields)
        );


        Ext.create('Rally.data.WsapiDataStore', {
            model: 'PortfolioItem/Feature',
            autoLoad:  true,
            filters: filter_object,
            fetch: fetch,
            listeners:  {
                scope:  this,
                load:  function(store, records, successful, opts){
                    var html = [];

                    if ( search_type !== "features" ) {
                        var non_feature = Ext.create('NonFeature', {});
                        me._buildFeatureHTML(non_feature, html);
                    }

                    Ext.Array.each(records, function(feature) {
                        me._buildFeatureHTML(feature, html);
                    });

                    this.down('#report_box').add({xtype: 'container', html: html.join('')});

                    if ( search_type !== "features" ) {
                        me._features.push(0);
                        me._records[0] = non_feature;
                        me._getStories(non_feature);
                    }

                    Ext.Array.each(records,  function(feature){
                        var oid = feature.get('ObjectID');
                        me._features.push(oid);
                        me._records[oid] = feature;
                        me._async_flags["feature" + oid] = 1;
                        me._getStories(feature);
                    });

                }
            }
        });
    },

    _getStories:  function(feature){
        var me = this;
        this.logger.log('_getStories', feature.get('FormattedID'));
        var feature_oid = feature.get('ObjectID');

        var filters = [
            {property: 'DirectChildrenCount', value: 0}
        ];
        if ( feature_oid > 0) {
            filters.push({property: 'Feature.ObjectID', value: feature_oid});
        } else {
            filters.push({property: 'Feature', value: ""});
            if ( this.down('#releasebox') ) {
                var release = this.down('#releasebox').getRecord();
                filters.push({property: 'Release.Name', value: release.get('Name')});
            }
        }
        var fetch = Ext.Array.push(['ObjectID', 'ScheduleState', 'FormattedID', 'Name'], this._getIndices(this._story_fields));

        Ext.create('Rally.data.WsapiDataStore', {
            model: 'UserStory',
            autoLoad:  true,
            filters: filters,
            fetch: fetch,
            limit: Infinity,
            listeners:  {
                scope:  this,
                load:  function(store, stories){
                    var html = [];
                    if ( stories.length === 0 ) {
                        html.push("No associated stories");
                    }
                    Ext.Array.each(stories, function(story) {
                        html.push("<div class='ts-story-headline' id='" + story.get('ObjectID') + "'>");
                        html.push(story.get('FormattedID') + ":  " + story.get('Name'));
                        html.push("</div>");
                        html.push("<div>");

                            // show details for selected fields
                            html.push("<div class='ts-story-details'>");
                                Ext.Array.each(me._story_fields, function(field){
                                    html.push("<div><i>" + field.text + "</i>:  " + me._render(story, field) + "</div>");
                                });
                            html.push("</div>");

                            // make a container for the test info
                            html.push("<div class='ts-test-divider'>Tests</div>");
                            html.push("<div id='testchildof" + story.get('ObjectID') + "' class='ts-test'>");
                            html.push("</div>");

                            // make a container for the depencency info
                            html.push("<div class='ts-dependency-divider'>Dependencies</div>");
                            html.push("<div id='dependencychildof" + story.get('ObjectID') + "' class='ts-dependency'>");
                            html.push("</div>");

                            // make a container for the notes info
                            html.push("<div class='ts-notes-divider'>Comments</div>");
                            html.push("<div id='noteschildof" + story.get('ObjectID') + "' class='ts-notes'>");
                            html.push("</div>");

                        html.push("</div>");
                    });

                    var container = Ext.dom.Query.selectNode('#childof' + feature_oid);
                    container.innerHTML = html.join(' ');
                    delete this._async_flags["feature" + feature_oid];

                    Ext.Array.each(stories,  function(story){
                        var oid = story.get('ObjectID');
                        if ( ! feature.get('_stories') ) {
                            feature.set('_stories',  [oid]);
                        } else {
                            var oids = feature.get('_stories');
                            oids.push(oid);
                            feature.set('_records', oids);
                        }
                        story.set('_tasks', []);
                        story.set('_testcases', []);
                        story.set('_defects', []);

                        me._records[oid] = story;

                        me._async_flags["story_tc" + oid] = 1;
                        me._getTests(story);
                    });
                    this._finishLoading();
                }
            }
        });
    },

    _getTests:  function(story){
        var me = this;
        this.logger.log('_getTests', story.get('FormattedID'));
        var story_oid = story.get('ObjectID');

        var filters = [
            {property: 'WorkProduct.ObjectID', value: story_oid}
        ];
        var fetch = Ext.Array.push(['ObjectID', 'State', 'FormattedID', 'Name'], this._getIndices(this._testcase_fields));

        Ext.create('Rally.data.WsapiDataStore', {
            model: 'TestCase',
            autoLoad:  true,
            filters: filters,
            fetch: fetch,
            limit: Infinity,
            listeners:  {
                scope:  this,
                load:  function(store, cases){
                    var html = [];
                    if ( cases.length === 0 ) {
                        html.push("No associated test cases");
                    }
                    Ext.Array.each(cases, function(test) {
                        var test_oid = test.get('ObjectID');
                        test.set('Feature', story.get('Feature'));

                        html.push("<div class='ts-test-headline' id='" + test_oid+ "'>");
                        html.push(test.get('FormattedID') + ":  " + test.get('Name'));
                        html.push("</div>");
                        html.push("<div>");

                            // show details for selected fields
                            html.push("<div class='ts-test-details'>");
                                Ext.Array.each(me._testcase_fields, function(field){
                                    html.push("<div><i>" + field.text + "</i>:  " + me._render(test, field) + "</div>");
                                });
                            html.push("</div>");

                        html.push("</div>");

                        // save for later
                        me._records[test_oid] = test;
                        var oids = story.get('_testcases');
                        oids.push(test_oid);
                        story.set('_testcases', oids);
                    });

                    var container = Ext.dom.Query.selectNode('#testchildof' + story_oid);
                    container.innerHTML = html.join(' ');
                    delete this._async_flags["story_tc" + story_oid];

                    this._finishLoading();
                }
            }
        });
    },

    _getTasks:  function(story){
        var me = this;
        this.logger.log('_getTasks', story.get('FormattedID'));
        var story_oid = story.get('ObjectID');

        var base_filter = Ext.create('Rally.data.QueryFilter', {property: 'WorkProduct.ObjectID', value: story_oid});
        var type_filter = Ext.create('Rally.data.QueryFilter', {property: 'TaskType', operator: 'contains', value: 'Development'}).or(
            Ext.create('Rally.data.QueryFilter', {property: 'TaskType', value: 'DBA'})).or(
                Ext.create('Rally.data.QueryFilter', {property: 'TaskType', value: 'Sys-Admin - Broker Override'}));

        var filters = base_filter.and(type_filter);

        var fetch = Ext.Array.push(['ObjectID', 'State', 'FormattedID', 'Name'], this._getIndices(this._task_fields));

        Ext.create('Rally.data.WsapiDataStore', {
            model: 'Task',
            autoLoad:  true,
            filters: filters,
            fetch: fetch,
            limit: Infinity,
            listeners:  {
                scope:  this,
                load:  function(store, tasks){
                    var html = [];
                    if ( tasks.length === 0 ) {
                        html.push("No associated tasks");
                    }
                    Ext.Array.each(tasks, function(task) {
                        var task_oid = task.get('ObjectID');
                        task.set('Feature', story.get('Feature'));
                        html.push("<div class='ts-task-headline' id='" + task_oid + "'>");
                            html.push(task.get('FormattedID') + ":  " + task.get('Name'));
                        html.push("</div>");
                        html.push("<div>");

                            // show details for selected fields
                            html.push("<div class='ts-task-details'>");
                                Ext.Array.each(me._task_fields, function(field){
                                    html.push("<div><i>" + field.text + "</i>:  " + me._render(task, field) + "</div>");
                                });
                            html.push("</div>");

                        html.push("</div>");

                        // save for later
                        me._records[task_oid] = task;
                        var oids = story.get('_tasks');
                        oids.push(task_oid);
                        story.set('_tasks', oids);

                    });

                    var container = Ext.dom.Query.selectNode('#taskchildof' + story_oid);
                    container.innerHTML = html.join(' ');
                    delete this._async_flags["story_task" + story_oid];

                    this._finishLoading();
                }
            }
        });
    },

    _getDefects:  function(story){
        var me = this;
        this.logger.log('_getDefects', story.get('FormattedID'));
        var story_oid = story.get('ObjectID');

        var filters = [
            {property: 'Requirement.ObjectID', value: story_oid}
        ];
        var fetch = Ext.Array.push(['ObjectID', 'State', 'FormattedID', 'Name'], this._getIndices(this._defect_fields));

        Ext.create('Rally.data.WsapiDataStore', {
            model: 'Defect',
            autoLoad:  true,
            filters: filters,
            fetch: fetch,
            limit: Infinity,
            listeners:  {
                scope:  this,
                load:  function(store, defects){
                    var html = [];
                    if ( defects.length === 0 ) {
                        html.push("No associated defects");
                    }
                    Ext.Array.each(defects, function(defect) {
                        var defect_oid = defect.get('ObjectID');
                        defect.set('Feature', story.get('Feature'));
                        html.push("<div class='ts-defect-headline' id='" + defect.get('ObjectID') + "'>");
                            html.push(defect.get('FormattedID') + ":  " + defect.get('Name'));
                        html.push("</div>");
                        html.push("<div>");

                            // show details for selected fields
                            html.push("<div class='ts-defect-details'>");
                                Ext.Array.each(me._defect_fields, function(field){
                                    html.push("<div><i>" + field.text + "</i>:  " + me._render(defect, field) + "</div>");
                                });
                            html.push("</div>");

                        html.push("</div>");
                        // save for later
                        me._records[defect_oid] = defect;
                        var oids = story.get('_defects');
                        oids.push(defect_oid);
                        story.set('_defects', oids);

                    });

                    var container = Ext.dom.Query.selectNode('#defectchildof' + story_oid);
                    container.innerHTML = html.join(' ');
                    delete this._async_flags["story_defect" + story_oid];

                    this._finishLoading();
                }
            }
        });
    },
    _render:  function(record, field){
        var me = this;
        var index = field.dataIndex;
        var csvIndex = field.csvIndex;  // where to store the result of an async call

        if ( typeof(index) === "function" ) {
            var id = this.getId() + "_" +  new Date().getTime();
            var display_value = "<span id='" + id + "'>...</span>";

            this._async_flags[field.text + record.get('ObjectID')] = 1;
            record.set(csvIndex, "querying...");
            index(record,  function(value) {
                var span = Ext.query('#' + id);

                if ( span && span[0] ) {
                    span[0].innerHTML = value;
                } else {
                    display_value = value;
                }
                record.set(csvIndex, value);

                delete me._async_flags[field.text + record.get('ObjectID')];
                me._finishLoading();
            });
        } else {
            var value = record.get(index);

            var display_value = value;
            if ( field.renderer ){
                display_value = field.renderer(value, record, this);
            } else if ( value === null ) {
                display_value = '--';
            } else if ( typeof(value) == 'object' ) {
                if ( typeof(value.get) == 'function' ) {
                    display_value = value.get('_refObjectName');
                } else if ( value._refObjectName ){
                    display_value = value._refObjectName;
                } else {
                    display_value = value;
                }
            }
            if (csvIndex) {
                record.set(csvIndex, display_value);
            }
        }
        return display_value;
    },

    _isAbleToDownloadFiles:  function() {
        try {
            var isFileSaverSupported = !!new Blob();
        } catch(e){
            this.logger.log(" NOTE: This browser does not support downloading");
            return false;
        }
        return true;
    },

    _finishLoading:  function() {
        // validate we're done
        var flag_size = Ext.Object.getSize(this._async_flags);
        var me = this;

        if ( flag_size === 0 ) {

            if ( this.down('#selector_outer_box').getEl() ) {
                this.down('#selector_outer_box').getEl().unmask();
            }

            /* Comment out for now
            if ( this._isAbleToDownloadFiles() ) {
                this.down('#button_box').removeAll();
                this.down('#button_box').add({
                    xtype: 'rallybutton',
                    itemId: 'save_button',
                    text: 'Save As CSV',
                    handler:  function() {
                        me._makeCSV();
                    }
                });
            }
            **/
            this.logger.log("-- DONE --");
        } else {
            this.down('#button_box').removeAll();

            if ( this.down('#selector_outer_box').getEl() ) {
                this.down('#selector_outer_box').getEl().mask("Loading " + flag_size + " ...");
            }
            this.logger.log("still waiting ", this._async_flags);
        }
    },
    _getCSVLineFromRecord:  function(record, fields) {
        var csv_line = [];
        Ext.Array.each(fields, function(field){
            csv_line.push(record.get(field.dataIndex));
        });
        return '"' + csv_line.join('", "') + '"';
    },
    _makeCSV:  function() {
        var me = this;
        var file_name = "feature_details.csv";

        var file_content = [];
        var header_line = [];
        Ext.Array.each(me._csv_fields,  function(field){
            header_line.push(field.text);
        });
        file_content.push(header_line.join(', '));

        Ext.Array.each(me._features,  function(foid) {
            var feature = me._records[foid];
            file_content.push(me._getCSVLineFromRecord(feature, me._csv_fields));

            me.logger.log("F:  " + feature.get('FormattedID') + ": " + feature.get('__stateChangedBy'));
            Ext.Array.each(feature.get('_stories'),  function(soid){
                var story = me._records[soid];
                file_content.push(me._getCSVLineFromRecord(story, me._csv_fields));

                Ext.Array.each(story.get('_tasks'), function(toid){
                    file_content.push(me._getCSVLineFromRecord(me._records[toid], me._csv_fields));
                });
                Ext.Array.each(story.get('_defects'), function(doid){
                    file_content.push(me._getCSVLineFromRecord(me._records[doid], me._csv_fields));
                });
                Ext.Array.each(story.get('_testcases'), function(toid){
                    file_content.push(me._getCSVLineFromRecord(me._records[toid], me._csv_fields));
                });

            });
        });

        var blob = new Blob([file_content.join("\r\n")], {type: 'text/plain;charset=utf-8'});
        saveAs(blob, file_name);
    }
});
