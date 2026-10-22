import { StartLearning } from '@/components/learn/StartLearning';

export default function StartLearningPage({ searchParams }: { searchParams: { title?: string } }) {
  return <StartLearning initial={{ title: typeof searchParams.title === 'string' ? searchParams.title : '' }} />;
}
