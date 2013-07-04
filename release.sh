proj="preview update"

for x in $proj
do
	rm -rf ${x}-release.zip
	git archive -o ${x}-release.zip --prefix=${x}-release/  master:${x}/
done
