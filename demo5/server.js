const Vue = require('vue');
const Koa = require('koa');
const Router = require('koa-router');
const send = require('koa-send');

// 引入缓存相关的模块
const LRU = require('lru-cache');

// 缓存
const microCache = new LRU({
  max: 100,
  maxAge: 1000 * 60 // 在1分钟后过期
});

const isCacheable = ctx => {
  // 假如 item 页面进行缓存
  if (ctx.url === '/item') {
    return true;
  }
  return false;
};

// 引入客户端，服务端生成的json文件, html 模板文件
const serverBundle = require('./dist/vue-ssr-server-bundle.json');
const clientManifest = require('./dist/vue-ssr-client-manifest.json');

let renderer = require('vue-server-renderer').createBundleRenderer(serverBundle, {
  runInNewContext: false, // 推荐
  template: require('fs').readFileSync('./src/index.html', 'utf-8'), // 页面模板
  clientManifest // 客户端构建 manifest
});

// 1. 创建koa koa-router实列
const app = new Koa();
const router = new Router();

const render = async (ctx, next) => {
  ctx.set('Content-Type', 'text/html')

  const handleError = err => {
    if (err.code === 404) {
      ctx.status = 404
      ctx.body = '404 Page Not Found'
    } else {
      ctx.status = 500
      ctx.body = '500 Internal Server Error'
      console.error(`error during render : ${ctx.url}`)
      console.error(err.stack)
    }
  }
  const context = {
    url: ctx.url,
    title: 'vue服务器渲染组件',
  }
  // 判断是否可缓存，可缓存，且缓存中有的话，直接把缓存中返回
  const cacheable = isCacheable(ctx);
  if (cacheable) {
    const hit = microCache.get(ctx.url);
    if (hit) {
      console.log('从缓存中取', hit);
      return ctx.body = hit;
    }
  }

  try {
    const html = await renderer.renderToString(context);
    ctx.body = html;
    if (cacheable) {
      console.log('设置缓存：', ctx.url);
      microCache.set(ctx.url, html);
    }
  } catch (err) {
    console.log(err);
    handleError(err);
  }
  next();
}
// 设置静态资源文件
router.get('/static/*', async (ctx, next) => {
  await send(ctx, ctx.path, {
    root: __dirname + '/./dist'
  });
});

router.get('*', render);

// 加载路由组件
app
  .use(router.routes())
  .use(router.allowedMethods());

// 启动服务
app.listen(3000, () => {
  console.log(`server started at localhost:3000`);
});