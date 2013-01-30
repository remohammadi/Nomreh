if ("undefined" == typeof(NomrehChrome)) {
	var NomrehChrome = {};
};

const Ci = Components.interfaces;
const Cc = Components.classes;

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

NomrehChrome = {
	currentPage: 'contests',
	logger: 0,
	contestsDbConnection: 0,
	currentContestDb: 0,
	currentContest: {},
	stringBundle: 0,
	contestTBody: 0,
	breadcrumbRoot: 0,
	init : function() {
		this.logger = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

		this.stringBundle = document.getElementById("nomreh-string-bundle");
		this.contestTBody = document.getElementById("contest-tbody");
		this.breadcrumbRoot = document.getElementById("breadcrumb");

		let file = this.getLocalDirectory();
		file.append("nomreh.sqlite");
		let alreadyExists = file.exists();
		this.contestsDbConnection = Services.storage.openDatabase(file); // create the file if not exist

		if (!alreadyExists) {
			this.logger.logStringMessage("Nomreh :: Creting contests table.");
			this.contestsDbConnection.createTable("contests", "id INTEGER PRIMARY KEY, title TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP");
		}

		this.loadContests();
	},
	setBreadcrumb: function(pages) {
		let contestsS = this.stringBundle.getString("nomreh.contests");;
		if (pages.length == 0) {
			this.breadcrumbRoot.innerHTML = '<li class="active">' + contestsS + '</li>';
		} else {
			let html = '<li><a href="#" onclick="NomrehChrome.goto(\'contests\');">' + contestsS + '</a> <span class="divider">&gt;</span></li>';
			for (var i = 0; i < pages.length; i++) {
				if (i < pages.length - 1) {
					html += '<li><a href="#" onclick="NomrehChrome.goto(\'' + pages[i][1] + '\');">' + pages[i][0] + '</a> <span class="divider">&gt;</span></li>';
				} else {
					html += '<li class="active">' + pages[i] + '</li>'
				}
			}
			this.breadcrumbRoot.innerHTML = html;
		}
	},
	goto: function(page, subpage) {
		if (page == this.currentPage) return;
		this.currentPage = page;
		$('.npage').hide();
		if (page == 'contest') {
			let id = 0;
			if (subpage == "undefined") {
				let title = this.stringBundle.getString("nomreh.new_contest");
				this.contestsDbConnection.executeSimpleSQL('INSERT INTO contests (title) VALUES("' + title + '")');
				let statement = this.contestsDbConnection.createStatement("SELECT last_insert_rowid() as new_id FROM contests");
				statement.executeStep();
				id = statement.row.new_id;
			} else {
				id = subpage;
			}

			this.currentContest = {}

			let statement = this.contestsDbConnection.createStatement("SELECT title, date FROM contests WHERE id=" + id);
			statement.executeStep();
			this.currentContest.title = statement.row.title;
			this.currentContest.date = statement.row.date;

			$("#contest_name").html(this.currentContest.title);

			if (this.currentContestDb != 0) {
				this.currentContestDb.asyncClose();
			}
			let file = this.getLocalDirectory();
			file.append("contest_" + id + ".sqlite");
			let alreadyExists = file.exists();
			this.currentContestDb = Services.storage.openDatabase(file); // create the file if not exist

			if (!alreadyExists) {
				this.logger.logStringMessage("Nomreh :: Creting contest [" + id + "] table.");
				//this.currentContestDb.createTable("contests", "id INTEGER PRIMARY KEY, title TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP");
			}

			this.setBreadcrumb([this.currentContest.title]);
		} else if (page == 'contests') {
			this.loadContests();
			this.setBreadcrumb([]);
		}
		$('#' + page).show();
	},
	loadContests : function() {
		this.contestTBody.innerHTML = "<tr><td colspan='2'>" +
			this.stringBundle.getString("nomreh.loading") + "</td></tr>";
		let statement = this.contestsDbConnection.createStatement("SELECT id, title, date FROM contests ORDER BY date DESC");
		statement.executeAsync({
			html: '',

			handleResult: function(aResultSet) {
				for (let row = aResultSet.getNextRow();
				row;
				row = aResultSet.getNextRow()) {
					this.html += "<tr><td><a href='#' onclick='NomrehChrome.goto(\"contest\", ";
					this.html += row.getResultByName("id") + ")'>";
					this.html += row.getResultByName("title") + "</a></td>";
					this.html += "<td>" + row.getResultByName("date") + "</td></tr>\n";
				}
			},

			handleError: function(aError) {
				this.logger.logStringMessage("Nomreh :: Error: " + aError.message);
			},

			handleCompletion: function(aReason) {
				if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED) {
					NomrehChrome.logger.logStringMessage("Nomreh :: Query canceled or aborted!");
				} else {
					NomrehChrome.contestTBody.innerHTML = this.html;
				}
			}
		});
	},
	getLocalDirectory : function() {
		let directoryService =
			Cc["@mozilla.org/file/directory_service;1"].
				getService(Ci.nsIProperties);
		// this is a reference to the profile dir (ProfD) now.
		let localDir = directoryService.get("ProfD", Ci.nsIFile);

		localDir.append("Nomreh");

		if (!localDir.exists() || !localDir.isDirectory()) {
			// read and write permissions to owner and group, read-only for others.
			localDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0774);
		}

		return localDir;
	},
	edit : function(element) {
		element = $(element);
		if (element.attr("editing") == 'true') return;
		element.attr("editing", 'true');
		let content = element.text();
		element.html('<input type="text" value="' + content + '" original="' + content +
			'" onkeyup="NomrehChrome.editKeyUp(event, this);" />');
		element.children()[0].focus();
	},
	editKeyUp : function(event, element) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;
		if ((keyCode == 13) || (keyCode == 27)) {
			el = $(element);
			let val = el.attr("original");
			let p = el.parent();
			if (keyCode == 13) {
				val = element.value;
			}
			p.html(val);
			p.attr("editing", 'false');
		}
	}
};
