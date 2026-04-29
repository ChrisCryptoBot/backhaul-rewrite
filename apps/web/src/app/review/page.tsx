interface ReviewPageProps {
  searchParams?: {
    rateConfirmationId?: string;
  };
}

export default function ReviewPage({ searchParams }: ReviewPageProps) {
  const rateConfirmationId = searchParams?.rateConfirmationId ?? null;

  return (
    <main style={{ padding: "24px" }}>
      <h1>Review Queue</h1>
      <p>
        {rateConfirmationId
          ? `Review route placeholder for rate confirmation ${rateConfirmationId}.`
          : "Review route placeholder. Select an item from Ready to open it here."}
      </p>
    </main>
  );
}
