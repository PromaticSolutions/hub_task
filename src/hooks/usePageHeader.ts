import { useEffect } from 'react';
import { useUi, type PageHeader } from '../store/ui';

/** Sets the title shown in the top bar and the browser tab. */
export function usePageHeader(title: string, extra: Omit<PageHeader, 'title'> = {}) {
  const { subtitle, color } = extra;
  useEffect(() => {
    useUi.setState({ header: { title, subtitle, color } });
    document.title = title ? `${title} · Hub Task Timely` : 'Hub Task Timely';
  }, [title, subtitle, color]);
}
