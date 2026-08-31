import LazyImage from '@/components/LazyImage'
import NotionIcon from '@/components/NotionIcon'
import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import { formatDateFmt } from '@/lib/utils/formatDate'
import SmartLink from '@/components/SmartLink'
import TagItemMini from './TagItemMini'

/**
 * 文章详情页的Hero块
 */
export default function PostHero({ post, siteInfo }) {
  const { locale, fullWidth } = useGlobal()

  if (!post) {
    return <></>
  }

  // 文章全屏隐藏标头
  if (fullWidth) {
    return <div className='my-8' />
  }

  const headerImage = post?.pageCover ? post.pageCover : siteInfo?.pageCover

  return (
    <div
      id='header'
      className='relative z-10 h-[30rem] w-full sm:h-[26rem] md:h-96 md:flex-shrink-0'
    >
      <LazyImage
        priority={true}
        src={headerImage}
        className='w-full h-full object-cover object-center absolute top-0'
      />

      <header
        id='article-header-cover'
        className='absolute inset-0 flex h-full w-full items-center justify-center bg-black bg-opacity-70 py-10'
      >
        <div className='mt-10 w-full max-w-5xl px-6 sm:px-10 lg:px-16'>
          <div className='mb-3 flex justify-center'>
            {post.category && (
              <>
                <SmartLink
                  href={`/category/${post.category}`}
                  passHref
                  legacyBehavior
                >
                  <div className='cursor-pointer px-2 py-1 mb-2 border rounded-sm dark:border-white text-sm font-medium hover:underline duration-200 shadow-text-md text-white'>
                    {post.category}
                  </div>
                </SmartLink>
              </>
            )}
          </div>

          {/* 文章Title */}
          <div className='flex justify-center text-center text-3xl font-bold leading-tight text-white shadow-text-md sm:text-4xl sm:leading-snug xl:text-5xl'>
            {siteConfig('POST_TITLE_ICON') && (
              <NotionIcon
                icon={post.pageIcon}
                className='mx-1 flex-shrink-0 text-3xl sm:text-4xl'
              />
            )}
            <span className='min-w-0'>{post.title}</span>
          </div>

          <section className='flex-wrap shadow-text-md flex text-sm justify-center mt-4 text-white dark:text-gray-400 font-light leading-8'>
            <div className='flex justify-center dark:text-gray-200 text-opacity-70'>
              {post?.type !== 'Page' && (
                <>
                  <SmartLink
                    href={`/archive#${formatDateFmt(post?.publishDate, 'yyyy-MM')}`}
                    passHref
                    className='pl-1 mr-2 cursor-pointer hover:underline'
                  >
                    {locale.COMMON.POST_TIME}: {post?.publishDay}
                  </SmartLink>
                </>
              )}
            </div>
          </section>

          <div className='mt-4 mb-1'>
            {post.tagItems && (
              <div className='flex justify-center flex-nowrap overflow-x-auto'>
                {post.tagItems.map(tag => (
                  <TagItemMini key={tag.name} tag={tag} />
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  )
}
