# react-native-temme
temme for react native，fork 自(feichao/temme)[https://github.com/feichao93/temme],替换了默认的cheerio
# 已知问题
默认情况下执行效率比较低下，可以尝试修改temme.ts第56行_useHtmlParser2为true提升性能。

`
$ = cheerio.load(html, { decodeEntities: false, _useHtmlParser2: true })
`

但是会导致某些深路径的选择器无法匹配，测试用例：

#pmlist tbody tr[id] 无法取到数据
#pmlist tr[id] 正常

.headaction .notabs@moderator{$moderator} 无法取到数据
.notabs@moderator{$moderator} 正常