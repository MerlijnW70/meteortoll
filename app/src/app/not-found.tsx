import Link from 'next/link'
import { BUTTON, PageIntro } from '@/components/ui'

export default function NotFound() {
    return (
        <div className="py-10">
            <PageIntro eyebrow="404" title="Page not found.">
                The link may be mistyped or out of date.
            </PageIntro>
            <Link href="/" className={`mt-8 ${BUTTON}`}>
                See all problems
            </Link>
        </div>
    )
}
