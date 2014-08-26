Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',   
    logger: new Rally.technicalservices.Logger(),
    _feature_summary_table_fields: [
        {dataIndex:'FormattedID',text:'PRD ID'},
        {dataIndex:'storyID',text:'User Story'},
        {dataIndex:'Priority',text:'Priority'},
        {dataIndex:'Name',text:'Requirement'}
    ],
    _feature_detail_table_rows: [
        {dataIndex:'State',text:'ID'},
        {dataIndex:'Name',text:'Requirement'},
        {dataIndex:'Priority',text:'Priority'},
        {dataIndex:'Platforms',text:'Platforms',subCells:[
            {dataIndex:'PlatformDotCom',text:'Dotcom',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformiPad',text:'iPad',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformiPhone',text:'iPhone',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformAndroidTablet',text:'Android Tablet',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformAndroidPhone',text:'Android Phone',renderer: TSRenderers.renderCheck}
        ]},
        {dataIndex:'Description',text:'Description', renderer: TSRenderers.renderDescription },
        {dataIndex:'Blocked', text:'Test Cases',renderer: TSRenderers.renderCheck},
        {dataIndex:'Notes',text:'Comments'}
    ],
    _story_detail_table_rows: [
        {dataIndex:'ScheduleState',text:'ID'},
        {dataIndex:'Name',text:'Requirement'},
        {dataIndex:'Platforms',text:'Platforms',subCells:[
            {dataIndex:'PlatformDotCom',text:'Dotcom',renderer: TSRenderers.renderCheck},
            {dataIndex:'Blocked',text:'iPad',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformiPhone',text:'iPhone',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformAndroidTablet',text:'Android Tablet',renderer: TSRenderers.renderCheck},
            {dataIndex:'PlatformAndroidPhone',text:'Android Phone',renderer: TSRenderers.renderCheck}
        ]},
        {dataIndex:'Description',text:'Description', renderer: TSRenderers.renderDescription },
        {dataIndex:'Notes',text:'Comments'}
    ],
    items: [
        {xtype:'container',itemId:'selector_outer_box', layout:{type:'hbox'}, padding: 10, items:[
            {xtype:'container',itemId:'type_box', margin: 5},
            {xtype:'container',itemId:'selector_box', margin: 5, defaults: { margin: 5 }},
            {xtype:'container',itemId:'button_box',margin: 5, defaults: { margin: 5 }}
        ]},
        {xtype:'container',itemId:'report_box', padding: 10},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this.logger.log("Launching with context",this.getContext());
        this._addInitiativeChooser();
    },
    _addInitiativeChooser: function() {
        this.down('#selector_box').add({
            xtype: 'rallycombobox',
            allowNoEntry: true,
            autoExpand: true,
            itemId:'product_chooser',
            fieldLabel: 'Initiative',
            labelWidth: 75,
            storeConfig: {
                autoLoad:true,
                model:'portfolioitem/initiative',
                limit:'Infinity'
            },
            listeners: {
                scope: this,
                change: function(box) {
                    if ( box.getValue() ) {
                        this._getData([]);
                        this.down('#pick_feature_button').setDisabled(false);
                        this.down('#print_button').setDisabled(false);
                        this.down('#save_button').setDisabled(false);
                    }
                }
            }
        });
        this._addFeatureButton();
        this._addPrintButton();
        this._addSaveButton();
    },
    _getIndices: function(hashes){
        var indices = [];
        Ext.Array.each(hashes,function(hash){
            if ( typeof(hash.dataIndex) === "string" ) {
                indices.push(hash.dataIndex);
            }
        });
        return indices;
    },
    _resetData: function() {
        this.down('#report_box').removeAll();
        this._feature_oids = [];
        this._records_by_oid = {};
    },
    _getData:function(chosen_features) {
        var me = this;
        this.logger.log('_getData', chosen_features);
        this._resetData();
        var product = this.down('#product_chooser').getRecord();
        
        this._makeTitlePage(product);
        this._makeProductSummarySection(product);
        
        this._getFeaturesAndStories([product],chosen_features).then({
            success: function(feature_oids) {
                me.logger.log("Features",feature_oids.length);
                me._mask("Generating Tables");
                me._makeFeatureSummaryTable(feature_oids,me._records_by_oid);
                me._makeFeatureDetailsTables(feature_oids,me._records_by_oid);
                me._unmask();
            },
            failure: function(error) {
                alert('Error Loading Products');
                me._unmask();
            }
        });
    },
    _getFeaturesAndStories: function(values,pre_chosen_features) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_getFeatures');  
        this._mask("Loading Features...");
        
        var filters = [];

        if ( pre_chosen_features && pre_chosen_features.length > 0 ) {
            Ext.Array.each(pre_chosen_features, function(feature){
                filters.push({property:'ObjectID',value:feature.get('ObjectID')});
            });
        } else {
            Ext.Array.each(values,function(value){
                filters.push({property:'Parent.ObjectID',value:value.get('ObjectID')});
            });
        }
        
        var filter_object = Ext.create('Rally.data.QueryFilter',filters[0]);
        for ( var i=1;i<filters.length;i++ ) {
            filter_object = filter_object.or(Ext.create('Rally.data.QueryFilter',filters[i]));
        }
        
        Ext.create('Rally.data.WsapiDataStore',{
            model:'PortfolioItem/Feature',
            autoLoad: true,
            filters:filter_object,
            context: { project: null },
            sorters: [{property:'Rank'}],
            listeners: {
                scope: this,
                load: function(store,records,successful,opts){
                    me.logger.log("# features",records.length);
                    
                    var promises=[];
                    
                    if ( records.length === 0 ) {
                        me._showNoFeaturesMessage();
                    }
                    // loop over all the products 
                    // -- save for future use in a hash
                    Ext.Array.each(records, function(feature){
                        var oid = feature.get('ObjectID');
                        me._feature_oids.push(oid);
                        me._records_by_oid[oid] = feature;
                        promises.push(me._getStoriesForFeature(feature));
                    });
                    
                    Deft.Promise.all(promises).then({
                        success: function(items) {
                            deferred.resolve(me._feature_oids);
                        }
                    });
                }
            }
        });
        return deferred.promise;
    },
    _getStoriesForFeature:function(feature){
        var deferred = Ext.create('Deft.Deferred');
        this._mask("Loading Stories...");
        Ext.create('Rally.data.WsapiDataStore',{
            model:'HierarchicalRequirement',
            autoLoad: true,
            filters: [{property:'PortfolioItem.ObjectID',value:feature.get('ObjectID')}],
            context: { project: null },
            sorters: [{property:'Rank'}],
            listeners: {
                scope: this,
                load: function(store,records,successful,opts){
                    this.logger.log('# stories for ', feature.get("FormattedID"), records.length);
                    feature.set('__stories',records);
                    deferred.resolve([]);
                }
            }
        });
        return deferred.promise;
    },
    _mask: function(text) {
        if ( this.down('#selector_outer_box').getEl() ) {
            this.down('#selector_outer_box').getEl().unmask();
            this.down('#selector_outer_box').getEl().mask(text);
        }
    },
    _unmask: function() {
        if ( this.down('#selector_outer_box').getEl() ) {
            this.down('#selector_outer_box').getEl().unmask();
        }
    },
    _makeTitlePage: function(product) {
        this.logger.log("_makeTitlePage",product);
        var html = [];
        html.push('<div class="print-after-box">');
        
        html.push('<h1><div class="ts-title">');
        html.push(product.get('Name') + '<br/>');
        html.push('PRODUCT REQUIREMENT<br/>');
        html.push('DOCUMENT (PRD)');
        html.push('</div></h1>');
        
        html.push('<div class="ts-title-contact">');
        html.push('Point of Contact: ' + product.get('Owner')._refObjectName);
        html.push('</div>');
        
        html.push('</div>');
        
        this.down('#report_box').add({ xtype:'container',html:html.join('\r\n'), padding: 10});
        
    },
    _makeProductSummarySection:function(product){
        this.logger.log("_makeProductSummarySection",product);
        var html = [];
        html.push('<div class="print-after-box">');
        
        html.push('<h2 class="ts-sans-serif-blue">1. Product Brief</h2>');
        
        html.push('<h3 class="ts-sans-serif-blue">1.1 Product Overview</h2>');
        html.push('<div class="ts-indented">');
        html.push(product.get('Description'));
        html.push('</div>');
        
        html.push('<h3 class="ts-sans-serif-blue">1.2 Consumer Value Proposition</h2>');
        html.push('<div class="ts-indented">');
        html.push(product.get('Notes'));
        html.push('</div>');
        
        html.push('<h3 class="ts-sans-serif-blue">1.3 Strategic Context</h2>');
        html.push('<div class="ts-indented">');
        html.push(product.get('StrategicContext'));
        html.push('</div>');
        
        html.push('<h3 class="ts-sans-serif-blue">1.4 Proposed State</h2>');
        html.push('<div class="ts-indented">');
        html.push(product.get('ProposedState'));
        html.push('</div>');
               
        html.push('<h3 class="ts-sans-serif-blue">1.5 Business Goals and Objectives</h2>');
        html.push('<div class="ts-indented">');
        html.push(product.get('BusinessGoalsDetails'));
        html.push('</div>');
        
        html.push('</div>');
        
        this.down('#report_box').add({ xtype:'container',html:html.join('\r\n'), padding: 10});

    },
    _makeFeatureSummaryTable:function(feature_oids,records_by_oid) {
        var me = this;
        this.logger.log("_makeFeatureSummaryTable",feature_oids,records_by_oid);
        var html = [];
        html.push('<h2 class="ts-sans-serif-blue">2. Table of Features</h2>');
        html.push('<span id="table-of-features-span">');
        html.push('<table id="table-of-features-table" class="ts-table-with-thin-border" style="width: 100%">');
        html.push('<tr>');
        // make the table header
        Ext.Array.each(this._feature_summary_table_fields,function(field){
            html.push('<td class="ts-table-header-center-justified" style="height: 23px; width: 100px;">');
            html.push(field.text);
            html.push('</td>');
        });
        html.push('</tr>');
        // make a row for each feature
        Ext.Array.each(feature_oids,function(feature_oid){
            var feature = records_by_oid[feature_oid];
            html.push('<tr>');
            // make a cell for each column for this feature
            Ext.Array.each(me._feature_summary_table_fields,function(field){
                html.push('<td id="id" class="ts-table-cell-center-justified" style="height: 25px; width: 100px;">');
                if ( field.dataIndex === 'FormattedID' ) {
                    html.push('<a href="#' + feature.get('FormattedID') + '">');
                    html.push(me._render(feature,field));
                    html.push('</a>');
                } else {
                    html.push(me._render(feature,field));
                }
                html.push('</td>');
            });
            html.push('</tr>');
            var stories = feature.get('__stories');
            if ( stories && stories.length > 0 ) {
                Ext.Array.each(stories,function(story){
                    html.push('<tr>');
                
                    // make a cell for each column for this story
                    Ext.Array.each(me._feature_summary_table_fields,function(field){
                        html.push('<td id="id" class="ts-table-cell-center-justified" style="height: 25px; width: 100px;">');
                        if ( field.dataIndex === 'FormattedID' ) {
                            html.push(' ');
                        } else if ( field.dataIndex === 'storyID' ){
                            html.push('<a href="#' + story.get('FormattedID') + '">');
                            html.push(me._render(story,{dataIndex:'FormattedID'}));
                            html.push('</a>');
                        } else {
                            html.push(me._render(story,field));
                        }
                        html.push('</td>');
                    });
                    html.push('</tr>');  
                });
            }
        });

        html.push('</table>');
        
        this.down('#report_box').add({ xtype:'container',html:html.join('\r\n'), padding: 10});
    },
    _addFeatureButton: function() {
        this.down('#button_box').add({
            xtype:'rallybutton',
            text:'Pick Features',
            itemId:'pick_feature_button',
            scope: this,
            disabled: true,
            handler: function() {
                this._showFeaturePicker();
            }
        });
    },
    _addSaveButton: function() {        
        this.down('#button_box').add({
            xtype:'rallybutton',
            text:'Save',
            itemId:'save_button',
            scope: this,
            disabled: true,
            handler: function() {
                var output = Ext.clone(this.down('#report_box')).el;
                var report_html = output.dom.innerHTML;

                var html = "";

                html += '<html>';

                html += "<body>";
//                html += "Bacon ipsum dolor sit amet rump pastrami landjaeger brisket, filet mignon strip steak biltong capicola pig pork loin andouille ground round leberkas flank. Leberkas porchetta hamburger shank turducken pork belly ground round sirloin ribeye shoulder frankfurter rump andouille. Pork meatloaf tongue salami ham hock ham. Salami jowl short ribs shank.";
//                html += "Tail beef ribs pig venison, shankle bresaola short loin. Leberkas turkey hamburger jerky jowl tenderloin pork chop. Capicola filet mignon shankle, tongue short ribs hamburger chuck. Landjaeger tail rump, pig drumstick andouille prosciutto t-bone tongue. Bacon cow sirloin shankle, t-bone boudin short loin frankfurter pork chop meatball landjaeger ribeye. T-bone brisket ball tip bacon ham pancetta. Brisket shoulder shank, cow short ribs drumstick turkey landjaeger biltong tongue tri-tip beef ribs sausage.";
                //html += report_html.replace(/div>/g,"div>LINEEND");
                html += report_html;
                html = html.replace(/<h(\d).*?>/g,"<h$1>");
                html = html.replace(/ /g,"&nbsp;")
                
                html = html.replace(/<div.*?>/ig,'<p>').replace(/<\/div>/g,"</p>");
                html = html.replace(/<br>/ig,"<p>");
                
                console.log(html);
                var html_array = html.split('LINEEND');
                
                html += '</body></html>';

//
                console.log(html);
                var doc = new jsPDF();
//                Ext.Array.each(html_array,function(line){
//                    doc.text(15,15,line);
//                });
                doc.fromHTML(html,15,15,{ 'width':170 });
                doc.save('test.pdf');
            }
        });
    },
    _addPrintButton: function() {
        
        this.down('#button_box').add({
            xtype:'rallybutton',
            text:'Print',
            itemId:'print_button',
            scope: this,
            disabled: true,
            handler: function() {
                var output = Ext.clone(this.down('#report_box')).el;
                var html = output.dom.innerHTML;
                
                var print_window = window.open('','PrintWindow','width=1000,height=400');
                print_window.document.write('<html><head>');
                print_window.document.write('<title>Print</title>');
                print_window.document.write(this.css_string);
                print_window.document.write('</head>');
                
                var class_string = "x-body x-webkit x-chrome x-mac x-reset x-container x-container-default x-layout-fit";
                print_window.document.write('<body class="' + class_string + '">');
                print_window.document.write('<div id="fred"></div>');
                print_window.document.write(html);
                print_window.document.write('</body></html>');
                print_window.document.close();

                print_window.print();

            }
        });
    },
    _makeFeatureDetailsTables:function(feature_oids,records_by_oid){
        this.logger.log("_makeFeatureDetailsTables",feature_oids,records_by_oid);
        var me = this;
        var header_html = [];
        header_html.push('<h2 class="ts-sans-serif-blue">3. Functional Requirements</h2>');
        me.down('#report_box').add({xtype:'container',html:header_html.join('\r\n'), padding: 10});
        Ext.Array.each(feature_oids,function(feature_oid,index){
            var feature = records_by_oid[feature_oid];
            var html = me._getFeatureHTML(feature,index);
            
            var stories = feature.get('__stories') || [];
            
            html.push('<div style="margin-top:16px;">');
            if ( stories.length == 0 ) {
                var feature_paragraph = index + 1;
                html.push('<h4 class="ts-sans-serif-blue">NOTE: Feature has no stories</h3>');
            }
            Ext.Array.each(stories,function(story,story_index){
                html.push(me._getStoryHTML(story,story_index,index));
            });
            html.push('</div>');

            me.down('#report_box').add({xtype:'container',html:html.join('\r\n'), padding: 10});
        });
        this._unmask();
    },
    _showNoFeaturesMessage: function() {
        this.down('#report_box').add({xtype:'container',html:"No features found for this product.", padding: 10});
        this._unmask();
    },
    _getStoryHTML: function(story,story_index,feature_index){
        var html = [];
        var me = this;
        
        var feature_paragraph = feature_index + 1;
        var story_paragraph = story_index + 1;
        
        var paragraph = '3.' + feature_paragraph + '.' + story_paragraph;
        
        html.push('<a name="'+ story.get('FormattedID') + '"></a>');
        html.push('<h4 class="ts-sans-serif-blue">' + paragraph + ' Story ' + story.get('FormattedID') + '</h4>');
        
        html.push('<div class="ts-indented">');
        html.push('<table>');
        Ext.Array.each(me._story_detail_table_rows,function(row){
            if ( row.subCells ) {
                html.push(me._getRowWithSubCell(row,story));
            } else {
                html.push('<tr>');
                html.push('<td class="ts-table-header-left-justified" style="height: 23px; width: 100px;">');
                html.push(row.text);
                html.push('</td>');
                html.push('<td class="ts-table-cell-left-justified" style="height: 25px; " colspan="5">');
                
                html.push(me._render(story,row));
                html.push('</td>');
                html.push('</tr>');
            }
        });
        html.push('</table>');
        html.push('</div>');
        
        return html.join('\r\n');
    },
    _getFeatureHTML:function(feature,index){
        var me = this;
        var html = [];
        this.logger.log("Getting feature HTML for feature ", feature.get("FormattedID"));

        var paragraph = index+1;

        html.push('<a name="'+ feature.get('FormattedID') + '"></a>');
        html.push('<h3 class="ts-sans-serif-blue">3.' + paragraph + ' Feature ' + feature.get('FormattedID') + '</h3>');
        html.push('<table>');
        Ext.Array.each(me._feature_detail_table_rows,function(row){
            if ( row.subCells ) {
                html.push(me._getRowWithSubCell(row,feature));
            } else {
                html.push('<tr>');
                html.push('<td class="ts-table-header-left-justified" style="height: 23px; width: 100px;">');
                html.push(row.text);
                html.push('</td>');
                html.push('<td class="ts-table-cell-left-justified" style="height: 25px; " colspan="5">');
                
                html.push(me._render(feature,row));
                html.push('</td>');
                html.push('</tr>');
            }
        });
        html.push('</table>');
        return html;
    },
    _getRowWithSubCell: function(row,feature){
        var me = this;
        var html = [];
        html.push('<tr>');
        html.push('<td class="ts-table-header-left-justified" style="width: 100px;" rowspan="2">');
        html.push(row.text);
        html.push('</td>');
       
        Ext.Array.each(row.subCells,function(cell){
            html.push('<td class="ts-table-cell-center-justified" style="height: 25px; width: 125px;">');
            html.push(cell.text);
            html.push('</td>');
        });
        html.push('</tr>');
        html.push('<tr>');
        Ext.Array.each(row.subCells,function(cell){
            html.push('<td class="ts-table-cell-center-justified" style="height: 25px; width: 125px;">');
            html.push(me._render(feature,cell) );
            html.push('</td>');
        });
        html.push('</tr>');
        return html.join('\r\n');
    },
    _render: function(record,field){
        var me = this;
        var index = field.dataIndex;
        var value = record.get(index);
        var csvIndex = field.csvIndex;  // where to store the result of an async call
        
        var display_value = value;
        if ( field.renderer ){
            display_value = field.renderer(value,record,this);
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
            record.set(csvIndex,display_value);
        }
        record.set("display_value",value);
        return display_value;
        
    },
    _isAbleToDownloadFiles: function() {
        try { 
            var isFileSaverSupported = !!new Blob(); 
        } catch(e){
            this.logger.log(" NOTE: This browser does not support downloading");
            return false;
        }
        return true;
    },
    _getCSVLineFromRecord: function(record,fields) {
        var csv_line = [];
        Ext.Array.each(fields,function(field){
            csv_line.push(record.get(field.dataIndex));
        });
        return '"' + csv_line.join('","') + '"';
    },
    _makeCSV: function() {
        var me = this;
        var file_name = "feature_details.csv";
        
        var file_content = [];
        var header_line = [];
        Ext.Array.each(me._csv_fields, function(field){
            header_line.push(field.text);
        });
        file_content.push(header_line.join(','));
        
        Ext.Array.each(me._features, function(foid) {
            var feature = me._records[foid];
            file_content.push(me._getCSVLineFromRecord(feature,me._csv_fields));
          
            Ext.Array.each(feature.get('_stories'), function(soid){
                var story = me._records[soid];
                file_content.push(me._getCSVLineFromRecord(story,me._csv_fields));

                Ext.Array.each(story.get('_tasks'),function(toid){
                    file_content.push(me._getCSVLineFromRecord(me._records[toid],me._csv_fields));
                });
                Ext.Array.each(story.get('_defects'),function(doid){
                    file_content.push(me._getCSVLineFromRecord(me._records[doid],me._csv_fields));
                });
                Ext.Array.each(story.get('_testcases'),function(toid){
                    file_content.push(me._getCSVLineFromRecord(me._records[toid],me._csv_fields));
                });
                
            });                
        });

        var blob = new Blob([file_content.join("\r\n")],{type:'text/plain;charset=utf-8'});
        saveAs(blob,file_name);
    },
    _showFeaturePicker: function() {
        if ( this.picker ) { this.picker.destroy(); }
        var project_oid = this.down('#product_chooser').getRecord().get('ObjectID');
        
        this.logger.log("Project OID", project_oid);
        this.picker = Ext.create('Rally.ui.dialog.ChooserDialog', {
            artifactTypes: ['portfolioitem/feature'],
            autoShow: true,
            storeConfig: {
                filters: [{property:'Parent.ObjectID',value:project_oid}]
            },
            title: 'Choose Features (selecting none shows all)',
            multiple: true,
            listeners: {
                artifactChosen: function(selected){
                    this._getData(selected);
                },
                scope: this
            }
         });
         this.picker.show();
    },
    css_string: "<style>" +
            "table { page-break-inside:auto } " +
            "tr    { page-break-inside:avoid; page-break-after:auto }" +
            "thead { display:table-header-group } " +
            "tfoot { display:table-footer-group } " +
            ".ts-table-with-thin-border {" +
"                border-style: solid;" +
"                border-width: 1px;" +
"            }" +
"            " +

"            .ts-title {" +
"                font-family: 'Times New Roman', Times, serif;" +
"                text-align: center;" +
"                font-weight:bold;" +
"                color: #000066;" +
"                font-size:50px;" +
"                margin: 50px;" +
"                margin-top: 100px;" +
"            }" +
"            " +
"            .ts-title-contact {" +
"                font-family: 'Times New Roman', Times, serif;" +
"                text-align: center;" +
"                font-weight:bold;" +
"                color: #000066;" +
"                font-size:25px;" +
"                margin: 50px;" +
"            }" +

"            .ts-indented {" +
"                padding-left: 30px;" +
"                margin-bottom: 10px;" +
"            }" +
"" +
"            div.print-after-box {" +
"               page-break-after:always;" +
"            }" +
"" +
"            table {" +
"               page-break-after:always;" +
"            }" +
"" +
"            .ts-table-header-center-justified {" +
"                background-color: #99CCFF !important; " +
"                -webkit-print-color-adjust: exact;" +
"                font-family: 'Times New Roman', Times, serif;" +
"                text-align: center;" +
"                font-size: small;" +
"                font-weight:bold;" +
"                border:solid;" +
"                border-left-width: 1px;" +
"                border-right-width: 1px;" +
"                border-bottom-width: 1px;" +
"                border-top-width: 1px" +
"            " +
"            }" +
"            .ts-table-header-left-justified {" +
"                background-color: #99CCFF!important; " +
"                -webkit-print-color-adjust: exact;" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                text-align: left;" +
"                font-size: small;" +
"                font-weight:bold;" +
"                border:solid;" +
"                border-left-width: 1px;" +
"                border-right-width: 1px;" +
"                border-bottom-width: 1px;" +
"                border-top-width: 1px;  " +
"                padding: 5px;" +
"            }" +
"            .ts-table-cell-left-justified {" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                text-align: left;" +
"                font-size: small;" +
"                border:solid;" +
"                border-left-width: 1px;" +
"                border-right-width: 1px;" +
"                border-bottom-width: 1px;" +
"                border-top-width: 1px;" +
"                padding: 5px;" +
"            }" +
"            " +
"            .ts-table-cell-center-justified {" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                text-align: center;" +
"                font-size: small;" +
"                border:solid;" +
"                border-left-width: 1px;" +
"                border-right-width: 1px;" +
"                border-bottom-width: 1px;" +
"                border-top-width: 1px;" +
"            }" +
"            " +
"            h2.ts-sans-serif-blue {" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                color: #000066;" +
"                font-size:20px;" +
"                margin-bottom: 10px;" +
"            }" +
"            " +
"            h3.ts-sans-serif-blue {" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                color: #000066;" +
"                font-size:16px;" +
"                margin-bottom: 10px;" +
"            }" +
"            " +
"            h4.ts-sans-serif-blue {" +
"                font-family: Arial, Helvetica, sans-serif;" +
"                color: #000066;" +
"                font-size:14px;" +
"                margin-bottom: 10px;" +
"                margin-top; 10px;" +
"            }" +
"            " +
"            .tsinfolink {" +
"                position:absolute;" +
"                right:0px;" +
"                width:5%;" +
"            }" +
        "</style>"
});
