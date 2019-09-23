frappe.pages['email_inbox'].on_page_load = function(wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Email Inbox',
		icon: 'icon-inbox',
		single_column: false
	});

	frappe.model.with_doctype('Communication', function() {
		wrapper.Inbox = new frappe.Inbox({
			method: 'frappe.desk.reportview.get',
			wrapper: wrapper,
			page: wrapper.page,
			no_loading: true
		});
	});
};

frappe.pages['email_inbox'].refresh = function(wrapper) {
	if (wrapper.inbox) {
		wrapper.Inbox.refresh()
	}
};

frappe.Inbox = frappe.ui.Listing.extend({
    init: function(opts) {
		$.extend(this, opts);
		wrap = this;
		this.wrapper = opts.wrapper;
		this.filters = {};
		this.page_length = 17;
		this.start = 0;
		this.cur_page = 1;
		this.no_result_message = 'No Emails to Display';
	    this.list_settings = JSON.parse(frappe.templates.inbox_list_settings);
	    this.list_settings.list_settings_key = frappe.session.user + "inbox";

		//check if mailto link
		var email = decodeURIComponent(frappe.get_route_str()).split("?");
		if (email.length>1){
			window.location.hash = window.location.hash.split("?")[0];
			var params = ""
			if (email.length >2){
				params = get_query_params(email[2], true)
			}
			new frappe.views.CommunicationComposer({
				doc: {},
				recipients: email[1].replace("mailto:",""),
				cc: params.cc || "",
				subject: params.subject || "",
				content: params.body || ""
			});
		}

		this.render_sidemenu();
		if (this.account) {
			var me = this;
			// setup listing
			me.make({
				doctype: 'Communication',
				page: me.page,
				method: 'frappe.desk.reportview.get',
				get_args: me.get_args,
				parent: me.page.main,
				start: 0,
				show_filters: true
			});

			this.render_headers();
			this.apply_list_settings();
			this.render_footer();
			this.render_buttons();
			this.init_select_all();
			var me = this;
			frappe.realtime.on("new_email", function(data) {
				for(var i =0; i<me.accounts.length; i++) {
					if (data.account == me.accounts[i].name) {
						frappe.utils.notify(data.account, "you have "+data.number+" new emails", {}, function () {
							window.focus();
							me.account = data.account;
							$(me.page.sidebar).find('.inbox-select[data-account="' + data.account_name + '" ]').trigger("click")
						});
						if(!me.fresh &&(data.account == me.account || me.account == me.allaccounts)) {
							me.fresh = true;
							me.refresh();
						}
					}
				}
				me.fresh = false
			});
		} else {
			frappe.msgprint(__("No Email Account assigned to you. Please contact your System Administrator"));

			setTimeout(function() {
				if (frappe.session.user==="Administrator") {
					frappe.set_route("List", "User");
				} else {
					frappe.set_route('');
				}
			}, 3000);
		}
    },
	refresh:function(){
    	var me = this;
		me.filter_list.remove_filter("email_account",false);
		me.filter_list.remove_filter("sent_or_received",false);
		me.filter_list.default_filters = [["Communication", "communication_type", "=", "Communication"]]
		//set filters for all account options
		if(me.account == "Sent"){
			me.filter_list.default_filters.push(["Communication", "sent_or_received", "=", "Sent"])
		}else{
			me.filter_list.default_filters.push(["Communication", "email_account", "in", me.account]);
			me.filter_list.default_filters.push(["Communication", "sent_or_received", "=", "Received"]);
		}
    	delete frappe.route_titles["create_contact"];
		delete frappe.route_titles["update_contact"];
		this.run();
	},
	render_headers: function(){
		var me = this;
		this.page.main.parent().css("padding-left","0px").css("padding-right","0px");
		var data = {"start":this.start,"page_length":this.page_length.toString()};
		this.list_header = $(frappe.render_template("inbox_headers", data)).appendTo(this.page.main.find(".list-headers"))
			.on("click", ".list-header-filter", function() {
				var fieldname = $(this).attr('data-name');
				me.filter_list.add_filter(me.doctype,fieldname);
				me.filter_list.filters[0].wrapper.find(".filter_field input").focus();
			});;
    },
	render_sidemenu: function () {
		var me = this;

		var buttons = '<div class="layout-main-section overlay-sidebar">';
		if (frappe.boot.email_accounts){
			me.accounts = [];
			var rows = "";

			for (var i = 0;i<frappe.boot.email_accounts.length;i++)
			{   var data = {name: frappe.boot.email_accounts[i]["email_account"], email: frappe.boot.email_accounts[i]["email_id"]};
				rows += frappe.render_template("inbox_sidebar_row", data);
				me.accounts.push(data)
			}
			me.allaccounts = $.map(me.accounts,function(v){return v.name}).join(",");
			buttons += frappe.render_template("inbox_sidebar_row", {name: me.allaccounts, email: "All Accounts"});
			buttons += rows;
			buttons += frappe.render_template("inbox_sidebar_row", {name: "Sent", email: "Sent"});
			me.account = me.allaccounts;

			me.page.sidebar.empty().append(buttons);
			$(me.page.sidebar).find('.inbox-select[data-account="' + me.allaccounts + '" ]').addClass("list-row-head").css("font-weight","bold");
			$(me.page.sidebar).find(".inbox-select").on("click",function(btn){
				me.account = $(btn.currentTarget).data("account");
				$(me.page.sidebar).find(".inbox-select").removeClass("list-row-head").css("font-weight","normal");
				$(btn.currentTarget).addClass("list-row-head").css("font-weight","bold");
				me.cur_page = 1;
				$(me.page.main).find(".list-select-all,.list-delete").prop("checked",false);
				me.toggle_actions();

				me.refresh();
				me.filter_list.loaded_stats = false;
				me.filter_list.hide_filter_list();
			});
		}
    },
	apply_list_settings: function(){
		var me = this;
        if (me.list_settings){
			me.filter_list.clear_filters();
			$.each(me.list_settings.filters, function(i, f){
				if(["email_account", "sent_or_received", "communication_type"].indexOf(f[1]) == -1){
					me.filter_list.add_filter(f[0], f[1], f[2], f[3]);
				}
			});
		}else{
			//add standard filter for accounts
			me.filter_list.add_filter("Communication", "deleted", "=", "No");
		}
		me.refresh()
	},
	get_args: function(){
		var args = {
			doctype: this.doctype,
			fields:["name", "sender", "sender_full_name", "communication_date", "recipients", "cc","communication_medium",
				"subject", "status" ,"reference_doctype", "reference_name", "timeline_doctype", "timeline_name",
				"timeline_label", "sent_or_received", "uid", "message_id", "seen", "nomatch", "has_attachment", "timeline_hide"],
			filters: this.filter_list.get_filters(),
			order_by: 'communication_date desc',
			save_list_settings: true,
			save_list_key: this.list_settings.list_settings_key
		};

		args.filters = args.filters.concat(this.filter_list.default_filters);

		return args;
	},
	render_list:function(data){
		var me = this
		$(me.wrapper).find(".result-list").html("");
		for (var i = 0; i < data.length; i++)
		{
			this.prepare_row(data[i]);
			$(frappe.render_template("inbox_list", {data: data[i]})).data("data", data[i]).appendTo($(me.wrapper).find(".result-list"))
		}
		//click action
		$(me.wrapper).find(".result-list").find(".list-row").click(function (btn) {
			if ($(btn.target).hasClass("noclick")) {
				return
			}
			var row = $(btn.target).closest(".list-row").data("data");
			if($(btn.target).hasClass("relink-link")){
				me.relink(row);
				return
			}
			if(me.account!="Sent") {
				if ($(btn.target).hasClass("company-link")) {
					me.company_select(row, true);
					return
				}
			}
			me.email_open(row);
		});
	},
	prepare_row:function(row){
		row.seen = this.account!="Sent" ? row.seen : 1;
	},
	render_footer:function(){
		var me = this;
		me.footer = $(me.wrapper).append(frappe.render_template("inbox_footer","")).find(".foot-con");
		frappe.require('assets/inbox/js/lib/bootstrap-paginator.min.js',function(){
		me.footer.bootstrapPaginator({
			currentPage: 1,
			totalPages: 10,
			bootstrapMajorVersion:3,
			onPageClicked: function(e,originalEvent,type,page){
				me.cur_page = page;
				$(me.wrapper).find('.footer-numbers').html('Showing: ' + (me.cur_page - 1) * me.page_length + ' to ' + (
					(me.data_length > (me.cur_page * me.page_length))?(me.cur_page * me.page_length):me.data_length) + ' of ' + me.data_length);
				me.run(true,true);
			}
		});
		});
		$(me.wrapper).find('.list-paging-area').addClass('hide');
	},
	update_footer:function(){
		var me = this;
		//default filter used for filters
		var filters = me.filter_list.get_filters();
		if (me.filter_list.default_filters){filters = filters.concat(me.filter_list.default_filters)}
		return frappe.call({
			method: me.method || 'frappe.desk.query_builder.runquery',
			type: "GET",
			freeze: (me.freeze != undefined ? me.freeze : true),
			args: {
				doctype: me.doctype,
				fields: ["count(*) as number"],
				filters: filters,
				save_list_settings: false
			},
			callback: function (r) {
				r.values = me.get_values_from_response(r.message);
				me.data_length = r.values[0]["number"];
				if (me.data_length != 0) {
					me.footer.show();
					me.last_page = Math.ceil(me.data_length / me.page_length);
					frappe.require('assets/inbox/js/lib/bootstrap-paginator.min.js',function(){
					me.footer.bootstrapPaginator({currentPage: 1, totalPages: me.last_page})
						});
				} else {
					me.footer.hide();
				}
				$(me.wrapper).find('.footer-numbers').html('Showing: ' + (me.cur_page - 1) * me.page_length + ' to ' + (
					(me.data_length > (me.cur_page * me.page_length)) ? (me.cur_page * me.page_length) : me.data_length) + ' of ' + me.data_length);
			},
			no_spinner: this.no_loading
		});
	},
	company_select:function(row,nomatch)
	{
		var me = this;
		var fields = [{
				"fieldtype": "Heading",
				"label": __("Create new Contact to Match Email Address"),
				"fieldname": "Option1"
				},
				{
					"fieldtype": "Button",
					"label": __("Create/Add new Contact"),
					"fieldname":"newcontact",
					"description": __('Create new Contact for a Customer, Supplier, User or Organisation to Match "') + row.sender + __('" Against')
				}

				];
		if (!nomatch) {
			fields.push({
				"fieldtype": "Heading",
				"label": __("Do not Match"),
				"fieldname": "Option3"
				});
			fields.push({
					"fieldtype": "Button",
					"label": __("Do not Match"),
					"fieldname":"nomatch"
				})
		}
		var d = new frappe.ui.Dialog ({
			title: __("Match Emails to a Company"),
			fields: fields
		});
		d.get_input("newcontact").on("click", function (frm) {
			d.hide();
			delete frappe.route_titles["update_contact"];
			frappe.route_titles["create_contact"] = 1;
			var name_split = row.sender_full_name?row.sender_full_name.split(' '):["",""];
			row.nomatch = 1;

			frappe.route_options = {
				"email_id": row.sender,
				"first_name": name_split[0],
				"last_name":name_split[name_split.length-1],
				"status": "Passive"
			};
			frappe.model.with_doctype("Contact", function() {
				var doc = frappe.model.get_new_doc("Contact");
				frappe.set_route("Form", "Contact", doc.name);
			})
		});
		if (!nomatch) {
			d.get_input("nomatch").on("click", function (frm) {
				d.hide();
				frappe.call({
					method: 'inbox.email_inbox.page.email_inbox.setnomatch',
					args: {
						name: row.name
					}
				});
				row.nomatch = 1;
				if (!nomatch) {
					me.email_open(row)
				}
			});
		}
		d.show();
	},
	email_open:function(row)
	{
		var me = this;
		me.actions_opened = false;
		if(me.open_email == row.name){
			return
		}
		me.open_email = row.name;

		//mark email as read
		if(me.account!="Sent") {
			this.mark_read(row);
		}
		//start of open email

		var emailitem = new frappe.ui.Dialog ({
                title: __(row.subject),
                fields: [{
                    "fieldtype": "HTML",
                    "fieldname": "email"
                }]
            });
		//prompt for match
		if (!row.timeline_label && !row.nomatch && me.account!="Sent") {
			setTimeout(function () {
				if (frappe.ui.open_dialogs.indexOf(emailitem) != -1 && !me.actions_opened) {
					me.company_select(row)
				}}, 4000);
		}

		var c = me.prepare_email(row);
		emailitem.fields_dict.email.$wrapper.html(frappe.render_template("inbox_email", {data:c}));
      $(emailitem.$wrapper).find(".reply").find("a").attr("target", "_blank");

		//Action buttons
		$(emailitem.$wrapper).find(".text-right").prepend(frappe.render_template("inbox_email_actions",{data:row})).on("click", function () {
			me.actions_opened = true;
		});
		$(emailitem.$wrapper).find(".relink-link").on("click", function () {
			me.relink(row); });
		$(emailitem.$wrapper).find(".delete-link").on("click", function () {
			me.delete_email({name:row.name, uid:row.uid});
			emailitem.hide()
		});
		$(emailitem.$wrapper).find(".print-link").on("click", function () {
			var newWindow = window.open();
			newWindow.document.write(frappe.render_template("print_email", {data:c}))
		});
		$(emailitem.$wrapper).find(".company-link").on("click", function () {
			me.company_select(row, true)});
		me.add_reply_btn_event(emailitem, c);

		//adjust sizing
		$(".modal-dialog").addClass("modal-lg");
		$(emailitem.$wrapper).find(".modal-title").parent().removeClass("col-xs-7").addClass("col-xs-7 col-sm-8 col-md-9");
		$(emailitem.$wrapper).find(".text-right").parent().removeClass("col-xs-5").addClass("col-xs-5 col-sm-4 col-md-3");

		//setup close
		emailitem.onhide = function() {
			me.open_email = null
		}

		emailitem.show();
	},
	add_reply_btn_event: function (emailitem, c) {
        var me = this;
//reply
        $(emailitem.$wrapper).find(".reply-link").on("click", function () {
            var sender = "";
			for (var i=0;i<me.accounts.length;i++){
				if(me.accounts[i].name===me.account){
					sender =  me.accounts[i].email;
					break;
				}
			}
			new frappe.views.CommunicationComposer({
				doc: {
					doctype: c.reference_doctype,
					name: c.reference_name
				},
				sender:sender,
				subject: "Re: " + c.subject,
				recipients: c.sender,
				last_email: c,
				attachments:c.attachments
			});
        });
//reply-all
		$(emailitem.$wrapper).find(".reply-all-link").on("click", function () {
            var senderName = frappe.user_info(frappe.session.user).fullname.toLowerCase();
            var senderEmail = frappe.user_info(frappe.session.user).email;
            var sender = "'" + senderName + "'" + " " + "<" + senderEmail + ">";
			var recipients = (c.sender + (c.recipients ? ", "+c.recipients:"") + (c.cc ? ", "+c.cc:""))
				.toLowerCase()
				.replace(sender,"")
				.replace(senderName + " " + "<" + senderEmail + ">", "")
				.replace(senderEmail,"");
            
			if (recipients.slice(-2) === ", ")
			{
				recipients = recipients.substring(0, recipients.lastIndexOf(", "));
			}
			
			new frappe.views.CommunicationComposer({
				doc: {
					doctype: c.reference_doctype,
					name: c.reference_name
				},
				sender:sender,
				subject: "Res: " + c.subject,
				recipients: recipients,
				last_email: c,
				attachments:c.attachments
			});
        });
//forward
		$(emailitem.$wrapper).find(".forward-link").on("click", function () {
            var sender = "";
			for (var i=0;i<me.accounts.length;i++){
				if(me.accounts[i].name===me.account){
					sender =  me.accounts[i].email;
					break;
				}
			}
			var communication = new frappe.views.CommunicationComposer({
				doc: {
					doctype: c.reference_doctype,
					name: c.reference_name
				},
				sender:sender,
				subject: "FW: " + c.subject,
				last_email: c,
				forward:true,
				attachments:c.attachments
			});

			$(communication.dialog.fields_dict.select_attachments.wrapper).find("input[type=checkbox]").prop("checked",true)
        });
    },
	relink:function(row){
		var me = this;
		var lib = "frappe.desk.doctype.communication_reconciliation.communication_reconciliation";
		var d = new frappe.ui.Dialog ({
			title: __("Relink Communication"),
			fields: [{
				"fieldtype": "Link",
				"options": "DocType",
				"label": __("Reference Doctype"),
				"fieldname": "reference_doctype",
				"get_query": function() {
				return {
						"query": lib +".get_communication_doctype"
					}
				}
			},
				{
					"fieldtype": "Dynamic Link",
					"options": "reference_doctype",
					"label": __("Reference Name"),
					"fieldname": "reference_name"
				},
				{
					"fieldtype": "Button",
					"label": __("Relink")
				}]
		});
		d.set_value("reference_doctype", row.reference_doctype);
		d.set_value("reference_name", row.reference_name);
		d.get_input("relink").on("click", function (frm) {
			values = d.get_values();
			if (values) {
				frappe.confirm(
					'Are you sure you want to relink this communication to ' + values["reference_name"] + '?',
					function () {
						d.hide();
						frappe.call
						({
							method: lib + ".relink",
							args: {
								"name": row.timeline_hide ? row.timeline_hide:row.name,
								"reference_doctype": values["reference_doctype"],
								"reference_name": values["reference_name"]
							},
							callback: function (frm) {
								$(me.wrapper).find(".row-named[data-name="+row.name+"]").find(".reference-document")
									.html(values["reference_name"])
								.attr("href",'#Form/'+values["reference_doctype"]+ '/'+values["reference_name"])
								.attr("title","Linked Doctype: "+values["reference_doctype"])
								row.reference_doctype = values["reference_doctype"]
								row.reference_name = values["reference_name"]
								
								return false;
							}
						})
					},
					function () {
						show_alert('Document not Relinked')
					}
				)
			}
		});
		d.show();
	},
	run:function(more,footer) {
		var me = this;
		me.start = (me.cur_page-1) * me.page_length;
		if (!footer) {
			this.update_footer()
		}
		this._super(more)
	},
	prepare_email:function(c){
		var me = this;
		frappe.call({
			method:'inbox.email_inbox.page.email_inbox.get_email_content',
			args:{
				doctype:"Communication",
				name:c.name
			},
			async:false,
			callback:function(r){
				c.attachments =r["message"][0];
				c.content = r["message"][1];
					}
		});
		c.doctype ="Communication";

        c.comment_on = comment_when(c.communication_date);


        if (c.attachments && typeof c.attachments === "string")
            c.attachments = JSON.parse(c.attachments);

        if (!c.comment_type)
            c.comment_type = "Email";

		c.comment = c.content;
        if (c.comment_type == "Email") {
           //should show full email content from past emails in inbox
            //c.comment = c.comment.split("<!-- original-reply -->")[0];
            c.comment = frappe.utils.strip_original_content(c.comment);
            c.comment = frappe.dom.remove_script_and_style(c.comment);

            c.original_comment = c.comment;
            //c.comment = frappe.utils.toggle_blockquote(c.comment);
        }


        if (!frappe.utils.is_html(c.comment)) {
            c.comment_html = frappe.markdown(__(c.comment));
        } else {
            c.comment_html = c.comment;
            c.comment_html = frappe.utils.strip_whitespace(c.comment_html);
			c.comment_html = c.comment_html.replace(/&lt;/g,"<").replace(/&gt;/g,">")
        }



        // bold @mentions
        if (c.comment_type === "Comment") {
            c.comment_html = c.comment_html.replace(/(^|\W)(@\w+)/g, "$1<b>$2</b>");
        }

		return c
	},
    init_select_all: function () {
        var me = this;

		$(me.wrapper).find(".list-select-all").on("click", function () {
			$(me.wrapper).find('.list-delete').prop("checked", $(this).prop("checked"));
			me.toggle_actions();
		});

		$(me.wrapper).on("click", ".list-delete", function (event) {
			me.toggle_actions();

			// multi-select using shift key
			var $this = $(this);
			if (event.shiftKey && $this.prop("checked")) {
				var $end_row = $this.parents(".list-row");
				var $start_row = $end_row.prevAll(".list-row")
					.find(".list-delete:checked").last().parents(".list-row");
				if ($start_row) {
					$start_row.nextUntil($end_row).find(".list-delete").prop("checked", true);
				}
			}
		});

		// after delete, hide delete button
		me.toggle_actions();
    },
	render_buttons: function(){
		var me = this;

		me.page.add_action_item("Delete", function(){me.delete_email()});
		me.page.add_action_item("Mark as UnRead", function(){me.mark_unread()});
		me.page.add_action_item("Mark as Read", function(){me.mark_read()});

		me.page.set_primary_action("New Email", function(){
			var sender = "";
			for (var i=0;i<me.accounts.length;i++){
				if(me.accounts[i].name===me.account){
					sender =  me.accounts[i].email;
					break;
				}
			}
			new frappe.views.CommunicationComposer({
					doc: {},
					sender: sender
			});
		},"icon-plus","New Email");
		//register mailto-handler
		me.page.add_action_icon("icon-gear", function(){
			var d = new frappe.ui.Dialog({
				title:"Settings",
				fields:[{
					fieldtype: "Heading",
					label: __("Set Default Email Client"),
					fieldname: "set_default_email"
				},{"fieldtype": "Button",
					click: me.setup_mailto,
					label: __("Set Default Email Client"), 
					description: __("Set your OS default email client to open Mailto links")
				}]
			});
			d.show()
		})
	},
	setup_mailto:function() {
		var OSName = "Unknown";
		// Safari 3.0+ "[object HTMLElementConstructor]" 
		var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0 || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || safari.pushNotification);
		// Internet Explorer 6-11
		var isIE = /*@cc_on!@*/false || !!document.documentMode;

		if(isSafari  || isIE) {
			msgprint("sorry your browser doesnt support this feature supported use chrome or firefox")
		} else {
			if(window.navigator.userAgent.indexOf("Windows NT 10.0") != -1) OSName = "Windows 10";
			if(window.navigator.userAgent.indexOf("Windows NT 6.2") != -1) OSName = "Windows 8";
			if(window.navigator.userAgent.indexOf("Windows NT 6.1") != -1) OSName = "Windows 7";
			if(window.navigator.userAgent.indexOf("Windows NT 6.0") != -1) OSName = "Windows Vista";
			if(window.navigator.userAgent.indexOf("Windows NT 5.1") != -1) OSName = "Windows XP";
			if(window.navigator.userAgent.indexOf("Windows NT 5.0") != -1) OSName = "Windows 2000";
			if(window.navigator.userAgent.indexOf("Mac") != -1) OSName = "Mac/iOS";
			if(window.navigator.userAgent.indexOf("X11") != -1) OSName = "UNIX";
			if(window.navigator.userAgent.indexOf("Linux") != -1) OSName = "Linux";
			if(OSName == "Windows 10"){
				msgprint("To setup the default email client select allow when your browser asks " +
					"then select your browser as the default email handler in windows 10 default programs")
			}
			window.navigator.registerProtocolHandler("mailto", window.location.href + "?%s", "ERPNext Inbox")
		}
	},
    toggle_actions: function () {
        var me = this;
        if (me.page.main.find(".list-delete:checked").length) {
            //show buttons
			$(me.page.actions_btn_group).show();
			$(me.page.btn_primary).hide()
        } else {
            //hide button
			$(me.page.actions_btn_group).hide();
			$(me.page.btn_primary).show()
        }
    },
	delete_email:function(data){
		var me = this;
		if (!data) {
			var names = $.map(me.action_checked_items('.data("data")'),function(v){return {name:v.name, uid:v.uid}});
			me.action_checked_items('.remove()')
		} else {
			var names = [{name:data.name, uid:data.uid}]
		}
		//could add flag to sync deletes but not going to as keeps history

		me.update_local_flags(names, "deleted", "1")
	},
	mark_unread:function(){
		var me = this;
		var names = $.map(me.action_checked_items('.data("data")'), function(v){return {name:v.name, uid:v.uid}});
		me.create_flag_queue(names,"-FLAGS","(\\SEEN)","seen");
		me.action_checked_items('.css("font-weight", "BOLD")');
		me.update_local_flags(names,"seen","0")
	},
	mark_read:function(data){
		var me = this;
		if (!data) {
			var names = $.map(me.action_checked_items('.data("data")'), function(v){return {name:v.name, uid:v.uid}});
			me.action_checked_items('.css("font-weight", "normal")')
		} else{
				var names = [{name:data.name, uid:data.uid}];
				$(me.wrapper).find(".row-named").filter("[data-name=" + data.name + "]").css("font-weight", "normal")
		}
		me.create_flag_queue(names,"+FLAGS","(\\SEEN)","seen");
		me.update_local_flags(names,"seen","1")

	},
	create_flag_queue:function(names,action,flag,field){
		frappe.call({
			method: 'inbox.email_inbox.page.email_inbox.create_flag_queue',
			args:{
				names:JSON.stringify(names),
				action:action,
				flag:flag,
				field:field
			}
		})
	},
	update_local_flags:function(names,field,val){
		frappe.call({
			method: 'inbox.email_inbox.page.email_inbox.update_local_flags',
			args:{
				names:JSON.stringify(names),
				field:field,
				val:val
			}
		});
		$(this.wrapper).find('.list-delete:checked').prop( "checked", false );
	},
	action_checked_items: function(action) {
		return $.map(this.page.main.find('.list-delete:checked'), function(e) {
			return eval('$(e).closest(".row-named")'+action);
		});
	},
});

