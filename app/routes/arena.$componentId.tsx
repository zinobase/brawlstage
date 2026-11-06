import { useParams } from "react-router";

import { ArenaStage } from "@/components/ArenaStage";

const ArenaComponentRoute = () => {
  const { componentId = "" } = useParams();
  return <ArenaStage key={componentId} componentId={componentId} />;
};

export default ArenaComponentRoute;
