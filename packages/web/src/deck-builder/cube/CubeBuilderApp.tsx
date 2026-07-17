import { BuilderApp } from '../shared/BuilderApp';
import { CreateCubeDialog } from './CreateCubeDialog';

export function CubeBuilderApp() {
  return (
    <BuilderApp
      builderFormat="cube"
      title="Cube Builder"
      addLabel="Create cube"
      CreateDialog={CreateCubeDialog}
    />
  );
}
