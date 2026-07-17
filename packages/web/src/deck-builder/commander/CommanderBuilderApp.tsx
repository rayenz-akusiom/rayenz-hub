import { BuilderApp } from '../shared/BuilderApp';
import { CreateCommanderDialog } from './CreateCommanderDialog';

export function CommanderBuilderApp() {
  return (
    <BuilderApp
      builderFormat="commander"
      title="Commander Builder"
      addLabel="Add Commander deck"
      CreateDialog={CreateCommanderDialog}
    />
  );
}
