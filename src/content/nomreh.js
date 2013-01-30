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
	init: function() {
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
					html += '<li><a id="breadcrumb-' + pages[i][0] + '" href="#" onclick="NomrehChrome.goto(\'' +
						pages[i][0] + '\');">' + pages[i][1] + '</a> <span class="divider">&gt;</span></li>';
				} else {
					html += '<li id="breadcrumb-' + pages[i][0] + '" class="active">' + pages[i][1] + '</li>'
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
			this.currentContest = {}

			if (subpage == "undefined") {
				let title = this.stringBundle.getString("nomreh.new_contest");
				this.contestsDbConnection.executeSimpleSQL('INSERT INTO contests (title) VALUES("' + title + '")');
				let statement = this.contestsDbConnection.createStatement("SELECT last_insert_rowid() as new_id FROM contests");
				statement.executeStep();
				this.currentContest._id = statement.row.new_id;
			} else {
				this.currentContest._id = subpage;
			}

			let statement = this.contestsDbConnection.createStatement("SELECT title, date FROM contests WHERE id=" + this.currentContest._id);
			statement.executeStep();
			this.currentContest.title = statement.row.title;
			this.currentContest.date = statement.row.date;

			$("#contest_name").html(this.currentContest.title);

			if (this.currentContestDb != 0) {
				this.currentContestDb.asyncClose();
			}
			let file = this.getLocalDirectory();
			file.append("contest_" + this.currentContest._id + ".sqlite");
			let alreadyExists = file.exists();
			this.currentContestDb = Services.storage.openDatabase(file); // create the file if not exist

			if (!alreadyExists) {
				this.logger.logStringMessage("Nomreh :: Creting contest [" + this.currentContest._id + "] table.");
				//this.currentContestDb.createTable("contests", "id INTEGER PRIMARY KEY, title TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP");
			}

			this.setBreadcrumb([['contest', this.currentContest.title]]);
		} else if (page == 'contests') {
			this.loadContests();
			this.setBreadcrumb([]);
		}
		$('#' + page).show();
	},
	loadContests: function() {
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
	getLocalDirectory: function() {
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
	edit: function(element, on_change) {
		element = $(element);
		if (element.attr("editing") == 'true') return;
		element.attr("editing", 'true');
		let content = element.text();
		let val = content.trim();
		if (element.attr("last_editing")) {
			val = element.attr("last_editing").trim();
		}
		element.html('<input type="text" value="' + val + '" original="' + content +
			'" onkeyup="NomrehChrome.editKeyUp(event, this, \'' + on_change + '\');"' +
			' onblur="NomrehChrome.editBlur(event, this)" />');
		element.children()[0].focus();
	},
	editKeyUp: function(event, element, on_change) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;
		if ((keyCode == 13) || (keyCode == 27)) {
			el = $(element);
			let val = el.attr("original");
			let p = el.parent();
			if (keyCode == 13) {
				val = element.value.trim();
			}
			p.html(val);
			p.removeAttr("last_editing")
			p.removeAttr("editing");
			if (keyCode == 13 && on_change) {
				NomrehChrome[on_change].call(this, p, val);
			}
		}
	},
	editBlur: function(event, element) {
		let el = $(element);
		let p = el.parent();
		p.attr("last_editing", element.value);
		p.html(el.attr("original"));
		p.attr("editing", 'false');
	},
	contestTitleModified: function(element, new_val) {
		var sql = 'UPDATE contests SET title="' + new_val + '" WHERE id=' + this.currentContest._id;
		this.contestsDbConnection.executeSimpleSQL(sql);
		let breadcrumb = document.getElementById("breadcrumb-contest");
		if (breadcrumb) {
			breadcrumb.innerHTML = new_val;
		}
	},
};
