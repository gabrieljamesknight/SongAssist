// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StemMixer from '../components/StemMixer'

describe('StemMixer', () => {
  it('renders and changes volumes', () => {
    const onVol = vi.fn()
    const onIso = vi.fn()
    render(
      <StemMixer
        stemVolumes={{ guitar: 80, backingTrack: 60 }}
        onVolumeChange={onVol}
        activeIsolation="full"
        onIsolationChange={onIso}
        isSeparating={false}
      />
    )

    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '70' } })
    expect(onVol).toHaveBeenCalledWith('guitar', 70)

    fireEvent.click(screen.getByRole('button', { name: 'Guitar Only' }))
    expect(onIso).toHaveBeenCalledWith('guitar')
  })

  it('shows separating state disables controls', () => {
    render(
      <StemMixer
        stemVolumes={{ guitar: 80, backingTrack: 60 }}
        onVolumeChange={() => {}}
        activeIsolation="full"
        onIsolationChange={() => {}}
        isSeparating={true}
      />
    )
    expect(screen.getByText('Separating stems...')).toBeInTheDocument()
  })
})

