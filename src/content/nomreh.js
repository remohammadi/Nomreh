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
	loading: 0,
	init: function(window) {
		this.logger = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
		this.prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

		this.contestTBody = document.getElementById("contest-tbody");
		this.breadcrumbRoot = document.getElementById("breadcrumb");
		this.loading = document.getElementById("loading");

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
	showLoading: function() {
		let l = $(this.loading);
		l.show();
	},
	hideLoading: function() {
		let l = $(this.loading);
		l.hide();
	},
	setBreadcrumb: function(pages) {
		let contestsS = this.getMessage("nomreh.contests");
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
			this.showLoading();
			this.currentContest = {}

			if (! subpage) {
				let title = this.getMessage("nomreh.new_contest");
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
				this.currentContestDb.createTable("judges", "id INTEGER PRIMARY KEY, title TEXT");
				this.currentContestDb.createTable("tests", "id INTEGER PRIMARY KEY, title TEXT, factor REAL");
				this.currentContestDb.createTable("students", "id INTEGER PRIMARY KEY, fname TEXT, lname TEXT, org TEXT, desc TEXT");
				this.currentContestDb.createTable("scores", "student_id INTEGER, judge_id INTEGER, test_id INTEGER, val REAL, UNIQUE(student_id, judge_id, test_id) ON CONFLICT REPLACE");
				this.currentContestDb.createTable("penalties", "student_id INTEGER, test_id INTEGER, val REAL, UNIQUE(student_id, test_id) ON CONFLICT REPLACE");

				this.currentContest.judges = {};
				this.currentContest.tests = {};
				this.currentContest.students = {};
				this.currentContest.scores = {};
				this.currentContest.penalties = {};

				this.loadContestDetails();
			} else {
				this.loadContestDb({'judges': true, 'tests': true, 'callback': this.loadContestDetails});
			}
		} else if (page == 'contests') {
			this.loadContests();
			this.setBreadcrumb([]);
			$('#contests').show();
		}
	},
	loadContestDbLock: 0,
	loadContestDb: function(flags) {
		if (NomrehChrome.loadContestDbLock > 0) {
			this.logger.logStringMessage("Nomreh :: loadContestDbLock= " + NomrehChrome.loadContestDbLock);
			return;
		}
		if ('judges' in flags) NomrehChrome.loadContestDbLock += 1;
		if ('tests' in flags) NomrehChrome.loadContestDbLock += 1;

		var _handleCompletion = function(aReason) {
			if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED) {
				NomrehChrome.logger.logStringMessage("Nomreh :: Query canceled or aborted!");
			}

			NomrehChrome.loadContestDbLock -= 1;
			if ((NomrehChrome.loadContestDbLock == 0) && ('callback' in flags)) {
				flags['callback'].call(NomrehChrome);
			}
		};
		var _handleError = function(aError) {
			NomrehChrome.logger.logStringMessage("Nomreh :: Error: " + aError.message);
		};

		if ('judges' in flags) {
			NomrehChrome.currentContest.judges = {'num': 0};

			let statement = this.currentContestDb.createStatement("SELECT id, title FROM judges ORDER BY id");
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.judges[row.getResultByName("id")] = row.getResultByName("title");
						NomrehChrome.currentContest.judges.num += 1;
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}

		if ('tests' in flags) {
			NomrehChrome.currentContest.tests = {'num': 0};

			let statement = this.currentContestDb.createStatement("SELECT id, title, factor FROM tests ORDER BY id");
			NomrehChrome.currentContest.tests.num = 0;
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.tests[row.getResultByName("id")] = [row.getResultByName("title"), row.getResultByName("factor")];
						NomrehChrome.currentContest.tests.num += 1;
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}
	},
	loadContestDetails: function() {
		let html = "";
		for (_id in this.currentContest.judges) {
			if (_id == 'num') continue;
			let j_title = this.currentContest.judges[_id];
			html += "<tr><td data-dbid='" + _id + "' onclick=\"NomrehChrome.edit(this, 'judgeTitleModified');\">" + j_title + "</td>";
			html +=	"<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeJudge(";
			html += _id + ")'><i class='icon-white icon-remove'></i></a></td></tr>";
		}
		let ph = this.getMessage("nomreh.new_judge_ph");
		html += "<tr><td colspan='2'><input class='input-block-level' type='text' placeholder='" + ph;
		html += "' onkeyup='NomrehChrome.newJudge(event, this)' /></td></tr>";
		document.getElementById("judges-tbody").innerHTML = html;

		this.setBreadcrumb([['contest', this.currentContest.title]]);
		this.hideLoading();
		$('#contest').show();
	},
	loadContests: function() {
		let statement = this.contestsDbConnection.createStatement("SELECT id, title, date FROM contests ORDER BY date DESC");
		statement.executeAsync({
			html: '',

			handleResult: function(aResultSet) {
				for (let row = aResultSet.getNextRow(); row;
						row = aResultSet.getNextRow()) {
					var _id = row.getResultByName("id");
					var title = row.getResultByName("title");
					this.html += "<tr><td><a href='#' onclick='NomrehChrome.goto(\"contest\", " + _id + ")'>";
					this.html += title + "</a></td>";
					this.html += "<td>" + row.getResultByName("date") + "</td>";
					this.html += "<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeContest(";
					this.html += _id + ", \"" + title + "\")'><i class='icon-white icon-remove'></i></a></td></tr>\n";
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
	newJudge: function(event, element) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;
		if (keyCode == 13) {
			this.showLoading();
			var v = element.value.trim();
			if (v == "") {
				v = this.getMessage("nomreh.new_judge_default") + (this.currentContest.judges.num + 1);
			}
			this.currentContestDb.executeSimpleSQL('INSERT INTO judges (title) VALUES("' + v + '")');
			this.loadContestDb({'judges': true, 'callback': this.loadContestDetails});
		}
	},
	judgeTitleModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE judges SET title="' + new_val + '" WHERE id=' + el.attr("data-dbid"));
	},
	removeContest: function(_id, title) {
		if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [title], 1),
							this.getMessage("nomreh.delete_sure"))) {
			var sql = 'DELETE FROM contests WHERE id=' + _id;
			this.contestsDbConnection.executeSimpleSQL(sql);
			this.loadContests();
		}
	},
	removeJudge: function(_id) {
		let statement = this.currentContestDb.createStatement("SELECT count(*) AS c FROM scores WHERE judge_id=" + _id);
		statement.executeStep();
		if (statement.row.c > 0) {
			let statement = this.currentContestDb.createStatement("SELECT title FROM judges WHERE id=" + _id);
			statement.executeStep();
			if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [statement.row.title]),
								this.getMessage("nomreh.delete_judge_sure"))) {
				this.showLoading();
				this.currentContestDb.executeSimpleSQL("DELETE FROM scores WHERE judge_id=" + _id);
				this.currentContestDb.executeSimpleSQL("DELETE FROM judges WHERE id=" + _id);
				this.loadContestDb({'judges': true, 'callback': this.loadContestDetails});
			}
		} else {
			this.showLoading();
			this.currentContestDb.executeSimpleSQL("DELETE FROM judges WHERE id=" + _id);
			this.loadContestDb({'judges': true, 'callback': this.loadContestDetails});
		}
	},
	removeTest: function(_id) {
		// TODO
	},
    getMessage: function(msg, ar) {
		try {
			return this.strings.getMessage(msg, ar);
		} catch (e) {
			this.alert(null, "Error reading string resource: " + msg); // Do not localize!
		}
    },
	strings: {
		_sbs: Cc["@mozilla.org/intl/stringbundle;1"]
			.getService(Ci.nsIStringBundleService)
			.createBundle("chrome://nomreh/locale/nomreh.properties"),

		getMessage: function(msg, ar) {
			if (ar) {
				return this._sbs.formatStringFromName(msg, ar, ar.length)
			} else {
				return this._sbs.GetStringFromName(msg);
			}
		}
	}
};
