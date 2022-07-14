'use strict';

const defaultOptions = require('./config');
const utils = require('./utils');
const svg2png = require('svg2png');
const minimatch = require('minimatch');
const fs = require('fs-extra');
const GifUtil = require('gifwrap').GifUtil;
const StaticImageRender = require('./render/static');
const DynamicImageRender = require('./render/dynamic');
const {
    setImageCache,
    GetImageCache,
    GeneralCacheFilePath
} = require('./utils/cache');
const IsEqual = require('./utils/isEqual');

async function ImageWatermark() {
    try {
        const hexo = this;
        const route = hexo.route;
        const watermarkOptions = hexo.config.watermark || {};
        watermarkOptions.text = watermarkOptions.text || hexo.config.url;
        // If enable is false return
        if (!watermarkOptions.enable || (!watermarkOptions.imageEnable && !watermarkOptions.textEnable) 
        || (watermarkOptions.imageEnable && watermarkOptions.textEnable)
        || this.env.env != watermarkOptions.mode) {
            return;
        }
        
        const options = Object.assign(Object.assign({}, defaultOptions), watermarkOptions);
        if (!Array.isArray(options.directory)) {
            // eslint-disable-next-line
            console.log('\x1b[40;91m ERROR directory params not array\x1b[0m');
        }
        // 支持的图片格式
        const staticTargetFile = ['jpg', 'jpeg', 'png'];
        const dynamicTargetFile = ['gif', 'sl'];
        const routes = route.list();
        
        let watermarkBuffer;
        // 过滤获取对应的图片
        let staticImgFileMatch;
        if (options.directory.length === 1) {
            staticImgFileMatch = `/${options.directory.join(',')}/**/*.{${staticTargetFile.join(',')}}`;
        } else {
            staticImgFileMatch = `{${options.directory.join(',')}}/**/*.{${staticTargetFile.join(',')}}`;
        }
        
        const staticImgFiles = routes.filter((file) => {
            console.log(file)
            return minimatch(file, staticImgFileMatch, {
                nocase: true,
                matchBase: true,
                partial: true,
            });
        });
        console.log(staticImgFileMatch);
        console.log(staticImgFiles);
        // 过滤获取对应的图片
        let dynamicImgFileMatch;
        if (options.directory.length === 1) {
            dynamicImgFileMatch = `${options.directory.join(',')}/**/*.{${dynamicTargetFile.join(',')}}`;
        } else {
            dynamicImgFileMatch = `{${options.directory.join(',')}}/**/*.{${dynamicTargetFile.join(',')}}`;
        }
        const dynamicImgFiles = routes.filter(file => {
            return minimatch(file, dynamicImgFileMatch, {
                nocase: true,
                matchBase: true,
                partial: true,
            });
        });
        // 无论是图片还是文字都全部转为图片再转为buffer，水印图片的buffer
        if (options.imageEnable) {
            watermarkBuffer = await utils.GetWatermarkImageBuffer(allImgFiles, options.watermarkImage, route);
        } else {
            const svgBuffer = utils.text2svg(options);
            watermarkBuffer = await svg2png(svgBuffer);
        }
        /**
         * 静态图片渲染
         */
        await Promise.all(staticImgFiles.map(async (filePath) => {
            // static为false，则不渲染静态图
            if (!options.static) {
                return;
            }
            if (IsEqual(filePath) && options.cache) {
                const cacheBuffer = GetImageCache(filePath);
                route.set(filePath, cacheBuffer);
                // eslint-disable-next-line
                options.log && console.log(`\x1b[40;93mWARNING\x1b[0m  \x1b[40;93mGenerated Image For Cache: \x1b[0m\x1b[40;95m${GeneralCacheFilePath(filePath)}\x1b[0m \x1b[40;93mPlease confirm that the file is correct\x1b[0m`);
            } else {
                const stream = route.get(filePath);
                const arr = [];
                stream.on('data', chunk => arr.push(chunk));
                // eslint-disable-next-line
                options.log && console.log(`\x1b[40;94mINFO\x1b[0m  \x1b[40;94mGenerated Image Process: \x1b[0m\x1b[40;95m${filePath}\x1b[0m`);
                const sourceBuffer = await new Promise(function (resolve) {
                    stream.on('end', () => resolve(Buffer.concat(arr)));
                });
                const compositeInfo = await StaticImageRender(sourceBuffer, watermarkBuffer, options);
                if (compositeInfo.isError) {
                    // eslint-disable-next-line
                    options.log && console.log(`\x1b[40;94mINFO\x1b[0m  \x1b[40;93mGenerated Image Waring: \x1b[0m\x1b[40;95m${filePath}\x1b[0m \x1b[40;93mThe width and height of the watermark image are larger than the original image, and cannot be rendered. The original image has been returned.\x1b[0m`);
                } else {
                    // eslint-disable-next-line
                    options.log && console.log(`\x1b[40;94mINFO\x1b[0m  \x1b[40;92mGenerated Image Success: \x1b[0m\x1b[40;95m${filePath}\x1b[0m`);
                    // 将渲染后的文件放到缓存区，会强制覆盖的
                    // eslint-disable-next-line
                    options.cache && setImageCache(filePath, compositeInfo.compositeBuffer)
                    route.set(filePath, compositeInfo.compositeBuffer);
                }
            }
        }));

        /**
         * 动态图片渲染
         */
        fs.emptyDirSync('public/_spiritling_temp');
        await Promise.all(dynamicImgFiles.map(async (filePath) => {
            // dynamic为false，则不渲染动态图
            if (!options.dynamic) {
                return;
            }
            // 如果名字一样，从缓存区取文件，不在进行重新添加水印
            if (IsEqual(filePath) && options.cache) {
                const cacheBuffer = GetImageCache(filePath);
                route.set(filePath, cacheBuffer);
                // eslint-disable-next-line
                options.log && console.log(`\x1b[40;93mWARNING\x1b[0m  \x1b[40;93mGenerated Image For Cache: \x1b[0m\x1b[40;95m${GeneralCacheFilePath(filePath)}\x1b[0m \x1b[40;93mPlease confirm that the file is correct\x1b[0m`);
            } else {
                const stream = route.get(filePath);
                const tempGif = `public/_spiritling_temp/${parseInt(Math.random() * 100000000)}`;
                const arr = [];
                stream.on('data', chunk => arr.push(chunk));
                // eslint-disable-next-line
                options.log && console.log(`\x1b[40;92mINFO\x1b[0m  \x1b[40;94mGenerated Image Process: \x1b[0m\x1b[40;95m${filePath}\x1b[0m`);
                const sourceBuffer = await new Promise(function (resolve) {
                    stream.on('end', () => resolve(Buffer.concat(arr)));
                });
                const inputGif = await DynamicImageRender(sourceBuffer, watermarkBuffer, options);
                const gif = await GifUtil.write(tempGif, inputGif.frames, inputGif);
                // eslint-disable-next-line
                options.log && console.log(`\x1b[40;94mINFO\x1b[0m  \x1b[40;92mGenerated Image Success: \x1b[0m\x1b[40;95m${filePath}\x1b[0m`);
                // 将渲染后的文件放到缓存区，会强制覆盖的
                // eslint-disable-next-line
                options.cache && setImageCache(filePath, gif.buffer)
                route.set(filePath, gif.buffer);
            }

        }));
        fs.removeSync('public/_spiritling_temp');

    } catch (err) {
        // eslint-disable-next-line
        console.log(`\x1b[40;91m${err}\x1b[0m`);
        // eslint-disable-next-line
        console.log(err);
    }
}

module.exports = ImageWatermark;;