# CodeGradXmarker

work : lint tests
clean :
	-rm .fw4ex.json [0-9]*ml
	-rm -rf tmp

# ############## Working rules:

lint :
	node_modules/.bin/jshint codegradxmarker.js spec/*.js

tests : clean
	-rm .fw4ex.json [0-9]*ml
	jasmine

reset :
	npm install -g yasmini
	npm link yasmini

refresh :
	cp -p ../../Exercises/JScommon/Yasmini/yasmini.js \
	   node_modules/yasmini/

test-all : 
	cd ../../Exercises/JScommon/Yasmini/ && m tests
	m tests

# ############## NPM package
# Caution: npm takes the whole directory that is . and not the sole
# content of marker.tgz 

publish : clean 
	-rm -rf node_modules/yasmini
	-rm -rf node_modules/codegradx*
	npm install -S yasmini
	npm install -S codegradxlib
	git status .
	-git commit -m "NPM publication `date`" .
	git push
	-rm -f CodeGradXmarker.tgz
	m CodeGradXmarker.tgz install
	cd tmp/CodeGradXmarker/ && npm version patch && npm publish
	cp -pf tmp/CodeGradXmarker/package.json .
	rm -rf tmp
	npm -g install codegradxmarker

CodeGradXmarker.tgz : clean
	-rm -rf tmp
	mkdir -p tmp
	cd tmp/ && git clone https://github.com/ChristianQueinnec/CodeGradXmarker.git
	rm -rf tmp/CodeGradXmarker/.git
	cp -p package.json tmp/CodeGradXmarker/ 
	tar czf CodeGradXmarker.tgz -C tmp CodeGradXmarker
	tar tzf CodeGradXmarker.tgz

REMOTE	=	www.paracamplus.com
install : CodeGradXmarker.tgz
	rsync -avu CodeGradXmarker.tgz \
		${REMOTE}:/var/www/www.paracamplus.com/Resources/Javascript/

# ############## 
init :
	@echo "Answer the following questions:"
	npm init

# end of Makefile
