import { Collision, Component, Position } from '@/types/pcb';

export function snapToGrid(position: Position, gridSizeMm: number): Position {
  if (gridSizeMm <= 0) {
    return position;
  }

  return {
    x: Math.round(position.x / gridSizeMm) * gridSizeMm,
    y: Math.round(position.y / gridSizeMm) * gridSizeMm,
  };
}

function getRect(component: Component) {
  const { x, y } = component.position;
  const { width, height } = component.bounds;

  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

function overlap(a: ReturnType<typeof getRect>, b: ReturnType<typeof getRect>) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function detectCollisions(components: Component[]): Collision[] {
  const collisions: Collision[] = [];

  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      const first = components[i];
      const second = components[j];

      if (first.layer !== second.layer) {
        continue;
      }

      if (overlap(getRect(first), getRect(second))) {
        collisions.push({
          firstId: first.id,
          secondId: second.id,
        });
      }
    }
  }

  return collisions;
}
