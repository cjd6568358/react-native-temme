export default {
    login: `
    input[name=formhash][value=$formhash];
    `,
    home: `
    head title{$title};
    head link[rel=apple-touch-icon][href=$iconUrl];
    a.notabs[href=$formhash|replace(/^.*formhash=/,'')];
    #creditlist_menu>li@creditList{
        &{$}
    };
    #menu ul li:first-child cite a[href=$uid|replace(/\\D/g,'')]{$username};
    #announcementbody>li@announcementList{
        a[href=$href]{$name}
    }
    .mainbox.forumlist@sectionList{
        h3 a{$name};
        .headactions .notabs@moderators{
            &{$}
        };
        tbody:has(.lastpost a)@children{
            h2 a[href=$href]{$name}
            h2 em{$today}
            h2+p{$desc|replace(/\\s/g, '')}
            h2+p+p:not(.moderators) a@children{
                &[href=$href]{$name};
            };
            p.moderators .notabs@moderators{
                &{$}
            };
            td.nums:nth-of-type(1){$thread|Number};
            td.nums:nth-of-type(2){$post|Number};
            td.lastpost@lastPost|pack{
                a[href=$id|replace(/^.*tid=(.*)&goto.*$/g,'$1')|Number]{$name}
                cite a{$author}
                cite{$date|split(' - ')|slice(1,2)|first}
            }
        }
    };
    `,
    pm: `
    input[name=formhash][value=$formhash];
    #menu ul li:first-child cite a[href=$uid|replace(/\\D/g,'')]{$username};
    #pmlist tr[id]@pmList{
        td:nth-child(2) a[id=$id|replace('pm_view_','')|Number]{$title};
        td:nth-child(2)[style]{$unread = 1};
        td:nth-child(3) a{$from};
        td:nth-child(4){$date};
    }
    `,
    reply: `
    input[name=formhash][value=$formhash];
    `,
    favorites: `
    input[name=formhash][value=$formhash];
    #menu ul li:first-child cite a[href=$uid|replace(/\\D/g,'')]{$username};
    .mainbox form tbody tr@threads{
        td:nth-child(2) a[href=$href]{$title};
        td:nth-child(4){$reply|Number};
        td:nth-child(3)@forum|pack{
            a[href=$href]{$name}
        }
        td:nth-child(5)@lastPost|pack{
            a[href=$href]{$date}
            a[target=_blank]{$username}
        }
    }
    `,
    forum: `
    .box.message p b{$error};
    input[name=formhash][value=$formhash];
    #menu ul li:first-child cite a[href=$uid|replace(/\\D/g,'')]{$username};
    title{$title|split(' - ')|slice(0,1)|first};
    #newpmnum{$newMessage|Number};
    #nav p:first-child a@breadcrumb{
        &[href=$href]{$name}
    };
    #ajax_favorite[href=$favorite_href];
    #ajax_favorite[href=$fid|replace(/\\D/g,'')|Number];
    #newspecial a[href=$new_special];
    .mainbox.threadlist+.pages_btns .pages@pagination|pack{
        em{$total|Number};
        strong{$current|Number};
        a.last{$last|replace(/\\D/g,'')|Number}
        a:not(.prev,.next,.last)@siblings{
            &[href=$href]{$page|Number}
        }
    }
    #headfilter ul li a@filter_tags{
        $id="all";
        &[href=$href]{$name};
        &[href^=forumdisplay][href=$id|replace(/^.*filter=/,'')];
    };
    .mainbox.threadlist .headactions a@action_tags{
        &[href=$href]{$name}
        &[href=$id|replace(/^.*typeid=/,'')];
    };
    .mainbox.threadlist table@categorys{
        $name = "公告";
        thead.separation td:nth-child(3){$name|trim|replace(/\\s/g,'')};
        tbody tr:not(.category)@threads{
            th em a@tag|pack{
                &[href=$id|replace(/^.*typeid=/,'')]{$name}
            }
            th a[href=$href]{$title}
            th span[id^=thread_] a[href=$href]{$title}
            th span[id^=thread_]+span.bold {$permission}
            th img[src*=attachicons]{$attach=1}
            th img[src*=digest]{$digest=1}
            td.author cite a{$author}
            td.author cite{html($thanks|replace(/<a(.*)absmiddle">/g,'')|Number)}
            td.author em{$date}
            td.nums strong{$reply|Number}
            td.nums em{$view|Number}
            td.lastpost@lastPost|pack{
                em a[href=$href]{$date}
                cite a{$author}
            }
        }
    }
    .mainbox.forumlist tbody tr@children{
        th h2 a[href=$href]{$name}
        th p{$desc}
        td.nums:nth-of-type(1){$thread}
        td.nums:nth-of-type(2){$post}
        td.lastpost@lastPost|pack{
            >a[href=$href]{$name}
            cite a{$author}
        }
    }
    `,
    thread: `
    .box.message p b{$error};
    input[name=formhash][value=$formhash];
    head title{$title|split(' - ')|first};
    #newpmnum{$newMessage|Number};
    #nav a@breadcrumb{
        &[href=$href]{$name}
    };
    #postform[action=$replyUrl];
    #ajax_favorite[href=$favoriteUrl];
    #ajax_favorite[href=$tid|replace(/\\D/g,'')|Number];
    form .mainbox.viewthread@posts{
        .postauthor@author|pack{
            >cite{$name|trim};
            >cite a[href=$uid|replace(/\\D/g,'')|Number]{$name};
            >.avatar>img:first-child[src=$avatar];
            >p:nth-of-type(1){$level};
            dl.profile{$profile|split(' ')|compact}
        }
        >table[id=$pid|replace(/\\D/g,'')];
        .postcontent .postinfo strong{$floor|replace(/\\D/g,'')|Number}
        .postcontent .postinfo{$date|match(/(\\d{4}.*\\d{2})/)|first}
        .postcontent>.postmessage>.postratings b{$thanks|Number}
        .postcontent>.postmessage .t_msgfont[id^=postmessage_]{html($content)}
        .postcontent>.postmessage .t_msgfont .t_msgfont[id^=postmessage_]{html($content)}
        .postcontent>.postmessage>.notice{html($notice)}
        .postcontent>.postmessage .postattachlist .t_attachlist@attachments{
          dt img[src=$icon];
          dt a[href=$link]{$name};
          dt em{$size};
          dl p:first-child{$date|trim};
          dl p:last-child img[src=$url];
        }
        .postcontent>.postmessage fieldset ul li@legend{
          &{$|trim|replace(/\\t*/g,'')|replace(/\\n/g,' ')};
        }
    };
    form+.pages_btns .pages@pagination|pack{
        em{$total|Number};
        strong{$current|Number};
        a.last{$last|replace(/\\D/g,'')|Number}
        a:not(.prev,.next,.last)@siblings{
            &[href=$href]{$page|Number}
        }
    }
    `,
    post: `
    input[name=formhash][value=$formhash];
    #newpost thead+tbody tr:has(.altbg1)@extra_params{
    td[class=altbg1]{$label}
    td[class=altbg2] input[name=$field];
    td[class=altbg2] select option@options{
        &[value=$value|trim]{$label|trim}
        };
    }
    #newpost tbody tr select[name=typeid] option@type_options{
        &[value=$value|trim]{$label|trim}
    }
    #fastUploadFlashBody+tbody{$upload_limits|trim|split(/\\n|\\t/)|compact}
    #postform[action=$post_action];
    `,
    my: `
    .credits_info ul>li@creditList{
        &{$|trim()}
    };
    a.notabs[href=$formhash|replace(/^.*formhash=/,'')];
    #menu li cite a{$username};
    .mainbox table:nth-of-type(1) tbody tr@recent_topics|compact{
        td:nth-child(1) a[href=$href]{$title}
        td:nth-child(1) a[href=$tid|split('-')|slice(1,2)|first];
        td:nth-child(2) a@forum|pack{
            &[href=$href]{$name}
        }
        td:nth-child(3) cite@lastPost{
            a:first-child[href=$tid|replace(/\\D/g,'')|Number]{$date}
            a:last-child{$author}
        }
        td:nth-child(4){$status}
    };
    .mainbox table:nth-of-type(2) tbody tr@recent_replys|compact{
        td:nth-child(1) a[href=$href]{$title}
        td:nth-child(1) a[href=$tid|replace(/^redirect.*ptid=/g,'')|Number];
        td:nth-child(2) a@forum|pack{
            &[href=$href]{$name}
        }
        td:nth-child(3) cite@lastPost{
            a:first-child[href=$tid|replace(/\\D/g,'')|Number]{$date}
            a:last-child{$author}
        }
        td:nth-child(4){$status}
    }
    `,
    profile: `
    .credits_info ul>li@creditList{
        &{$|trim()}
    };
    a.notabs[href=$formhash|replace(/^.*formhash=/,'')];
    #menu li cite a{$username};
    img.avatar[src=$avatar];
    .memberinfo_avatar a[href=$uid|replace(/\\D/g,'')];
    .memberinfo_forum li:nth-child(2) font{$level};
    .mainbox tbody tr@pmlist{
      th a[href=$id|replace(/\\D/g,'')]{$title}
      td.user@from{
          a[href=$uid|replace(/\\D/g,'')]{$name}
      }
      td.time{$time}
    }
    `,
    search: `
    input[name=formhash][value=$formhash];
    `,
    searchResult: `
    .mainbox.threadlist tbody@threads{
        th a[href=$href]{$title};
        th a[href=$tid|replace(/^.*tid=|&highlight.*$/g,'')|Number];
        th img[src*=attachicons]{$attach=1}
        th img[src*=digest]{$digest=1}
        td.forum@forum|pack{
            a[href=$href]{$name}
        }
        td.author a{$author}
        td.author em{$date}
        td.nums strong{$reply|Number}
        td.nums em{$view|Number}
        td.lastpost@lastPost|pack{
            em a[href=$href]{$date}
            cite a{$username}
        }
    };
    .pages_btns .pages@pagination|pack{
        em{$total|Number};
        strong{$current|Number};
        a:not(.prev,.next,.last)@siblings{
            &[href=$href]{$page|Number}
        }
        a.last{$last|replace(/\\D/g,'')|Number}
    }
    `
}

export const selectorsMap = {
    // home: ['index.html'],
    // pm: ['pm.html'],
    forum: ['forum-198-1.html'],
    // thread: ['thread-12681308-1-1.html', "thread-12764094-1-1", "thread-12774140-1-1", "thread-12845354-1-1"],
    // search: ['search.html'],
    // profile: ['profile.html'],
    // my: ['my.html'],
    // favorites: ['favorites.html', "favorites_forum.html"]
}