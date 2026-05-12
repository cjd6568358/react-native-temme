# react-native-temme
temme for react native，fork 自(feichao/temme)[https://github.com/feichao93/temme],替换了默认的cheerio。
具体语法请参考 docs目录
# 已知问题
temme.ts第56行_useHtmlParser2为false为parse5模式，执行效率比较低下

_useHtmlParser2为true启用HtmlParser2可以提升性能，会导致某些选择器失效，原因是不规范解析。

测试用例：

#pmlist tbody tr[id] 无法取到数据
#pmlist tr[id] 正常


.headaction .notabs@moderator{$moderator} 无法取到数据
.notabs@moderator{$moderator} 正常
